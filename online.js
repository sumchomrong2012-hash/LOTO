/* =====================================================================================
   Khmer Chess — ONLINE MODE (Supabase)            អុកចត្រង្គ អនឡាញ
   Loaded BEFORE the main game script. It only touches the game through a few hooks
   (onlineBlocked, onlineSubmit, evalOnlineResult, onlineClockExpired, onlineEnterMode,
    onlineLeave, onlineSendChat, openLobby) and reuses the game's own functions at run time.
   ===================================================================================== */

let sb = null, sbUser = null, sbProfile = null;
let onlineRoom = null;            // latest room JSON from the server (room_json)
let onlineApplied = 0;            // how many moves are applied on this screen
let onlineReplaying = false;      // true while rebuilding a game from the move list (no animation / sound)
let onlineResultShown = false;
let onlineChannel = null, onlinePollTimer = null, onlineLobbyTimer = null;
let onlineLoadToken = 0, onlineMoveTimes = [], onlineServerOffset = 0;
let onlineIncoming = new Map(), onlinePumpTimer = null, onlineCatching = false;
let onlineLastMsgId = 0, onlineConnected = false, onlinePendingJoin = null, onlineLoading = false;

const OL_TIMES = [[0, 'No clock'], [1, '1 min'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [20, '20 min'], [60, '60 min']];
const OL_ERR = {
  not_signed_in: 'Please sign in first.', room_not_found: 'Room not found — check the code.',
  room_not_open: 'That room already has two players.', too_many_waiting_rooms: 'You already have 3 waiting rooms — cancel one first.',
  too_many_games: 'You have too many active games.', not_your_turn: 'It is not your turn.',
  bad_ply: 'Game was out of sync — reloading.', game_not_active: 'This game is not active.',
  not_in_room: 'You are not a player in this room.', name_taken: 'That display name is taken.',
  bad_name: 'Display name must be 2–24 characters.', not_expired: 'Time has not expired yet.',
  no_offer: 'There is no draw offer to answer.', no_profile: 'Profile missing — sign out and in again.'
};
function olErr(e) { const m = (e && e.message) || String(e); for (const k in OL_ERR) if (m.includes(k)) return OL_ERR[k]; return m; }
function olEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function olById(id) { return document.getElementById(id); }
function olColorName(c) { return c === 'w' ? 'White' : 'Black'; }
function olMyColorIn(r) { return r.host_id === (sbUser && sbUser.id) ? r.host_color : (r.host_color === 'w' ? 'b' : 'w'); }
function olTimeLabel(m) { return m > 0 ? m + ' min' : 'No clock'; }

/* ------------------------------------------------------------------ hooks used by the game */
function onlineBlocked() {
  return currentMode === 'online' && (!onlineRoom || onlineRoom.status !== 'playing' || turn !== myRole);
}
// Called by the game right after a move is made on THIS screen (the game has already updated the board).
function evalOnlineResult(mover, expired) {
  const noMoves = getAllLegalMoves(turn).length === 0;
  if (noMoves && inCheck(boardState, turn)) return { result: mover, reason: 'checkmate' };
  if (expired) return { result: 'draw', reason: 'counting' };
  if (noMoves) return { result: 'draw', reason: 'stalemate' };
  if (isInsufficientMaterial()) return { result: 'draw', reason: 'insufficient' };
  return null;
}
async function onlineSubmit(ply, fr, fc, tr, tc, res, attempt) {
  const room = onlineRoom; attempt = attempt || 0;
  if (!room || !sb) return;
  try {
    const { data, error } = await sb.rpc('submit_move', {
      p_room: room.id, p_ply: ply, p_from: fr * 8 + fc, p_to: tr * 8 + tc,
      p_result: res ? res.result : null, p_reason: res ? res.reason : null
    });
    if (error) throw error;
    if (!onlineRoom || onlineRoom.id !== room.id) return;
    if (data.ply <= ply) { olHardReload(); return; }          // server did not record it (e.g. our clock had run out)
    onlineMoveTimes[ply] = { by: myRole, t: Date.parse(data.last_move_at) };
    olApplyRoom(data);
  } catch (e) {
    const msg = (e && e.message) || '';
    if (/fetch|network|timeout|load failed/i.test(msg) && attempt < 4) {          // connection hiccup: try again
      setTimeout(() => onlineSubmit(ply, fr, fc, tr, tc, res, attempt + 1), 1500); return;
    }
    appendChatMessage('System', '⚠️ ' + olErr(e));
    olHardReload();
  }
}
function onlineClockExpired(color) {
  stopTimer();
  if (!onlineRoom || onlineRoom.status !== 'playing') return;
  olClaimTimeout(0);
}
async function olClaimTimeout(n) {
  const room = onlineRoom; if (!room || room.status !== 'playing') return;
  try {
    const { data, error } = await sb.rpc('claim_timeout', { p_room: room.id });
    if (error) throw error;
    olApplyRoom(data);
  } catch (e) {
    if (/not_expired/.test((e && e.message) || '') && n < 8) {                    // our clock was a hair early — ask again
      setTimeout(() => { if (onlineRoom && onlineRoom.status === 'playing') olClaimTimeout(n + 1); }, 1200);
    } else olRefreshRoom();
  }
}
function onlineSendChat(text) {
  if (!onlineRoom || !sb) { appendChatMessage('System', 'Join or create a room first.'); return false; }
  sb.rpc('send_message', { p_room: onlineRoom.id, p_body: text }).then(({ error }) => { if (error) appendChatMessage('System', '⚠️ ' + olErr(error)); });
  return true;
}

/* ------------------------------------------------------------------ setup / auth */
function olInit() {
  if (sb) return true;
  const cfg = window.KHMER_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /YOUR[-_]/i.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY)) return false;
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  sb.auth.onAuthStateChange((event, session) => {
    sbUser = session ? session.user : null;
    if (event === 'PASSWORD_RECOVERY') setTimeout(olNewPassword, 300);
    if (event === 'SIGNED_OUT') { sbProfile = null; }
  });
  return true;
}
async function onlineEnterMode() {
  olUpdatePanel();
  if (!olInit()) {
    appendChatMessage('System', 'Online play is not configured yet. Put your Supabase URL and key in config.js.');
    olSetStatus('Not configured — edit config.js', false); return;
  }
  const { data } = await sb.auth.getSession();
  sbUser = data && data.session ? data.session.user : null;
  if (!sbUser) { olOpenAuth(); olUpdatePanel(); return; }
  await olLoadProfile();
  olUpdatePanel();
  if (currentMode !== 'online') return;
  if (onlinePendingJoin) { const c = onlinePendingJoin; onlinePendingJoin = null; olJoinByCode(c); return; }
  if (!onlineRoom) openLobby();
}
async function olLoadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', sbUser.id).maybeSingle();
  sbProfile = data || { display_name: (sbUser.email || 'Player').split('@')[0], wins: 0, losses: 0, draws: 0 };
}
function olOpenAuth(tab) { olAuthTab(tab || 'in'); olById('auth-msg').textContent = ''; olById('auth-modal').classList.add('active'); }
function olCloseAuth() { olById('auth-modal').classList.remove('active'); }
function olAuthTab(t) {
  olById('auth-tab-in').classList.toggle('active', t === 'in'); olById('auth-tab-up').classList.toggle('active', t === 'up');
  olById('auth-name-wrap').style.display = t === 'up' ? 'flex' : 'none';
  olById('auth-go').textContent = t === 'up' ? 'Create account • បង្កើតគណនី' : 'Sign in • ចូលគណនី';
  olById('auth-go').dataset.mode = t;
  olById('auth-forgot').style.display = t === 'in' ? 'inline' : 'none';
}
function olAuthMsg(text, good) { const m = olById('auth-msg'); m.textContent = text; m.style.color = good ? '#6ee7b7' : '#fca5a5'; }
async function olAuthSubmit() {
  if (!olInit()) { olAuthMsg('Not configured: edit config.js'); return; }
  const email = olById('auth-email').value.trim(), password = olById('auth-pass').value;
  const mode = olById('auth-go').dataset.mode || 'in';
  if (!email || !password) { olAuthMsg('Enter your email and password.'); return; }
  const btn = olById('auth-go'); btn.disabled = true; olAuthMsg('Please wait…', true);
  try {
    if (mode === 'up') {
      const name = olById('auth-name').value.trim();
      if (name.length < 2 || name.length > 24) throw new Error('Display name must be 2–24 characters.');
      if (password.length < 6) throw new Error('Password must be at least 6 characters.');
      const { data, error } = await sb.auth.signUp({
        email, password, options: { data: { display_name: name }, emailRedirectTo: location.origin + location.pathname }
      });
      if (error) throw error;
      if (!data.session) { olAuthMsg('Account created. Check your email and tap the confirmation link, then sign in.', true); olAuthTab('in'); btn.disabled = false; return; }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    olCloseAuth(); olById('auth-pass').value = '';
    await onlineEnterMode();
  } catch (e) { olAuthMsg(olErr(e)); }
  btn.disabled = false;
}
async function olForgotPassword() {
  if (!olInit()) return;
  const email = olById('auth-email').value.trim();
  if (!email) { olAuthMsg('Type your email above first.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) olAuthMsg(olErr(error)); else olAuthMsg('Password reset email sent. Open the link on this device.', true);
}
async function olNewPassword() {
  const pw = prompt('Choose a new password (at least 6 characters):');
  if (!pw) return;
  const { error } = await sb.auth.updateUser({ password: pw });
  alert(error ? olErr(error) : 'Password updated.');
}
async function olSignOut() {
  if (!sb) return;
  closeLobby(); olLeaveRoomView();
  await sb.auth.signOut(); sbUser = null; sbProfile = null;
  olUpdatePanel(); olOpenAuth();
}
async function olRename() {
  const n = prompt('New display name (2–24 characters):', sbProfile ? sbProfile.display_name : '');
  if (!n) return;
  const { data, error } = await sb.rpc('set_display_name', { p_name: n });
  if (error) { alert(olErr(error)); return; }
  sbProfile = data; olRenderLobbyHeader(); olUpdatePanel();
}

/* ------------------------------------------------------------------ lobby */
function openLobby() {
  if (!olInit()) { olSetStatus('Not configured — edit config.js', false); return; }
  if (!sbUser) { olOpenAuth(); return; }
  olRenderLobbyHeader();
  olById('lobby-modal').classList.add('active');
  olRefreshLobby();
  clearInterval(onlineLobbyTimer);
  onlineLobbyTimer = setInterval(() => { if (!document.hidden) olRefreshLobby(); }, 5000);
}
function closeLobby() { olById('lobby-modal').classList.remove('active'); clearInterval(onlineLobbyTimer); onlineLobbyTimer = null; }
async function olRefreshLobby() { olLoadProfile().then(olRenderLobbyHeader).catch(() => {}); olLoadMyRooms(); olLoadOpenRooms(); }
function olRenderLobbyHeader() {
  if (!sbProfile) return;
  olById('ol-who').textContent = '👤 ' + sbProfile.display_name;
  olById('ol-stats').textContent = `🏆 ${sbProfile.wins} wins • ${sbProfile.losses} losses • ${sbProfile.draws} draws`;
}
function olFillCreateForm() {
  const t = olById('ol-new-time'); if (t.options.length) return;
  OL_TIMES.forEach(([m, l]) => { const o = olEl('option', null, l); o.value = m; if (m === 20) o.selected = true; t.appendChild(o); });
}
async function olCreateRoom() {
  const btn = olById('ol-create-btn'); btn.disabled = true;
  try {
    const { data, error } = await sb.rpc('create_room', {
      p_color: olById('ol-new-color').value, p_minutes: Number(olById('ol-new-time').value),
      p_first_turn: olById('ol-new-first').value, p_public: olById('ol-new-public').checked
    });
    if (error) throw error;
    await olEnterRoom(data);
  } catch (e) { alert(olErr(e)); }
  btn.disabled = false;
}
async function olJoinByCode(code) {
  code = (code || '').trim().toUpperCase(); if (!code) return;
  try {
    if (!sbUser) { onlinePendingJoin = code; olOpenAuth(); return; }
    const { data, error } = await sb.rpc('join_room', { p_code: code });
    if (error) throw error;
    await olEnterRoom(data);
  } catch (e) { alert(olErr(e)); openLobby(); }
}
function olJoinFromInput() { const i = olById('ol-join-code'); olJoinByCode(i.value); i.value = ''; }
function olRoomRow(r, mode) {
  const row = olEl('div', 'ol-row'); const meta = olEl('div', 'ol-meta');
  const mine = mode === 'mine';
  const myC = mine ? olMyColorIn(r) : (r.host_color === 'w' ? 'b' : 'w');
  const opp = mine ? (r.host_id === sbUser.id ? r.guest_name : r.host_name) : r.host_name;
  const l1 = olEl('div', 'ol-l1', mine ? (opp ? 'vs ' + opp : 'Waiting for an opponent…') : (r.host_name || 'Player'));
  let status = '';
  if (mine) {
    if (r.status === 'waiting') status = 'Code ' + r.code;
    else if (r.status === 'playing') status = (r.turn === myC ? '⏳ your turn' : 'opponent’s turn');
    else status = r.result === 'draw' ? 'Draw' : (r.result === myC ? '🏆 You won' : 'You lost');
  } else status = 'plays ' + olColorName(r.host_color);
  meta.appendChild(l1);
  meta.appendChild(olEl('div', 'ol-l2', `You are ${olColorName(myC)} • ${olTimeLabel(r.minutes)} • ${status}`));
  row.appendChild(meta);
  const actions = olEl('div', 'ol-actions');
  if (mine) {
    actions.appendChild(olBtn(r.status === 'finished' ? 'View' : 'Open', 'btn btn-online', () => olEnterRoom(r)));
    if (r.status === 'waiting') actions.appendChild(olBtn('✕', 'btn', async () => { await sb.rpc('resign', { p_room: r.id }); olLoadMyRooms(); }));
  } else actions.appendChild(olBtn('Join • ចូល', 'btn btn-online', () => olJoinByCode(r.code)));
  row.appendChild(actions);
  return row;
}
function olBtn(text, cls, fn) { const b = olEl('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
async function olLoadMyRooms() {
  const box = olById('ol-my-list');
  const { data, error } = await sb.rpc('my_rooms');
  box.textContent = '';
  if (error) { box.appendChild(olEl('div', 'ol-empty', olErr(error))); return; }
  if (!data.length) { box.appendChild(olEl('div', 'ol-empty', 'No games yet — create a room or join one.')); return; }
  data.forEach(r => box.appendChild(olRoomRow(r, 'mine')));
}
async function olLoadOpenRooms() {
  const box = olById('ol-open-list');
  const { data, error } = await sb.rpc('list_open_rooms');
  box.textContent = '';
  if (error) { box.appendChild(olEl('div', 'ol-empty', olErr(error))); return; }
  if (!data.length) { box.appendChild(olEl('div', 'ol-empty', 'No open public rooms right now.')); return; }
  data.forEach(r => box.appendChild(olRoomRow(r, 'open')));
}

/* ------------------------------------------------------------------ entering / leaving a room */
function olResetBoardForRoom() {
  stopTimer(); hideKingEmergency(); hideCountingBadge();
  countingActive = false; countingUsedOnce = false; countingRegime = null;
  setupStandardPosition();
  capturedPieces = { w: [], b: [] }; turn = onlineRoom.first_turn || 'w'; moveNumber = 1;
  selectedSquare = null; legalMovesCache = []; lastMove = null; historyStack = []; redoStack = [];
  gameOver = false; isAnimating = false; aiSide = 'off';
  onlineApplied = 0; onlineMoveTimes = []; onlineIncoming.clear(); onlineResultShown = false;
  baseTurnControl = Infinity;
  baseMatchControl = onlineRoom.minutes > 0 ? onlineRoom.minutes * 60 : Infinity;
  whiteMatchTime = blackMatchTime = baseMatchControl; whiteTurnTime = blackTurnTime = Infinity;
  olById('result-modal').classList.remove('active');
  olById('chat-messages').textContent = ''; onlineLastMsgId = 0;
}
async function olEnterRoom(room) {
  olUnsubscribe();
  const token = ++onlineLoadToken;
  onlineLoading = true;
  onlineRoom = room; myRole = olMyColorIn(room);
  olOnlyIfOnlineMode();
  olResetBoardForRoom();
  isBoardFlipped = (myRole === 'b');
  closeLobby(); olCloseAuth();
  renderBoard(); updateUI(); olUpdatePanel();
  olSubscribe(room.id);
  try { await olLoadAll(token); } finally { if (token === onlineLoadToken) onlineLoading = false; }
  if (token !== onlineLoadToken) return;
  olStartPolling(); olCatchUp();
}
function olOnlyIfOnlineMode() {                       // make sure the UI is in Online mode (e.g. when opened from an invite link)
  if (currentMode !== 'online') { currentMode = 'online'; updateModeUI('online'); olById('chat-input').disabled = false; olById('chat-send-btn').disabled = false; }
}
async function olLoadAll(token) {
  const id = onlineRoom.id;
  const [r, m, c] = await Promise.all([
    sb.rpc('get_room', { p_room: id }),
    sb.from('moves').select('*').eq('room_id', id).order('ply'),
    sb.from('room_messages').select('*').eq('room_id', id).order('id')
  ]);
  if (token !== onlineLoadToken) return;               // user moved on to another room
  if (r.error) { appendChatMessage('System', '⚠️ ' + olErr(r.error)); return; }
  onlineRoom = r.data; onlineServerOffset = Date.parse(r.data.server_now) - Date.now();
  olResetBoardForRoom();
  onlineReplaying = true;
  try {
    for (const mv of (m.data || [])) {
      onlineMoveTimes[mv.ply] = { by: mv.by_color, t: Date.parse(mv.created_at) };
      const before = onlineApplied;
      executeMove(Math.floor(mv.from_sq / 8), mv.from_sq % 8, Math.floor(mv.to_sq / 8), mv.to_sq % 8, true);
      if (onlineApplied === before) { console.warn('replay stopped at ply', mv.ply); break; }
    }
  } finally { onlineReplaying = false; }
  isAnimating = false;
  renderBoard(); updateUI(); updateKingEmergency && updateKingEmergency();
  (c.data || []).forEach(x => olOnMessage(x, true));
  if (onlineRoom.status === 'waiting') appendChatMessage('System', `Room ${onlineRoom.code} is open. Share the code or invite link with your friend.`);
  else if (onlineRoom.status === 'playing') appendChatMessage('System', `Game on — you are ${olColorName(myRole)}. ${olColorName(onlineRoom.turn)} moves first/now.`);
  olApplyRoom(onlineRoom, true);
}
function olHardReload() { if (onlineRoom) { const r = onlineRoom; olEnterRoom(r); } }
function olUnsubscribe() {
  if (onlineChannel && sb) { try { sb.removeChannel(onlineChannel); } catch (e) {} }
  onlineChannel = null; clearInterval(onlinePollTimer); onlinePollTimer = null; clearTimeout(onlinePumpTimer);
  onlineConnected = false;
}
function olLeaveRoomView() { olClearChatBadge(); olUnsubscribe(); onlineLoadToken++; onlineLoading = false; onlineRoom = null; onlineIncoming.clear(); olHideDrawBar(); olSetNames(null); olUpdatePanel(); }
function onlineLeave() {                               // called by the game whenever the mode is switched / reset
  olLeaveRoomView(); closeLobby(); olCloseAuth(); onlineReplaying = false;
}

/* ------------------------------------------------------------------ realtime */
function olSubscribe(roomId) {
  onlineChannel = sb.channel('room-' + roomId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moves', filter: 'room_id=eq.' + roomId }, p => olOnMove(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + roomId }, () => olRefreshRoom())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: 'room_id=eq.' + roomId }, p => olOnMessage(p.new, false))
    .subscribe(status => {
      onlineConnected = (status === 'SUBSCRIBED'); olUpdatePanel();
      if (status === 'SUBSCRIBED') olResync();
    });
}
function olStartPolling() {                            // safety net: phones suspend websockets when the screen sleeps
  clearInterval(onlinePollTimer);
  onlinePollTimer = setInterval(() => { if (!document.hidden && onlineRoom) olResync(); }, 5000);
}
async function olResync() {
  if (!onlineRoom || !sb || onlineLoading) return;
  olRefreshRoom();
  if (onlineRoom.status === 'playing' || onlineRoom.status === 'finished') olCatchUp();
  try {
    const { data } = await sb.from('room_messages').select('*').eq('room_id', onlineRoom.id).gt('id', onlineLastMsgId).order('id');
    (data || []).forEach(x => olOnMessage(x, false));
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && onlineRoom) olResync(); });
window.addEventListener('online', () => { if (onlineRoom) olResync(); });

async function olRefreshRoom() {
  if (!onlineRoom || !sb) return;
  const id = onlineRoom.id;
  try {
    const { data, error } = await sb.rpc('get_room', { p_room: id });
    if (!error && data && onlineRoom && onlineRoom.id === id) olApplyRoom(data);
  } catch (e) {}
}
async function olCatchUp() {
  if (onlineCatching || !onlineRoom) return; onlineCatching = true;
  try {
    const id = onlineRoom.id;
    const { data } = await sb.from('moves').select('*').eq('room_id', id).gte('ply', onlineApplied).order('ply');
    (data || []).forEach(olOnMove);
  } catch (e) {} finally { onlineCatching = false; }
}
function olOnMove(m) {
  if (!m || !onlineRoom || onlineLoading) return;      // while (re)loading, the full move list is fetched anyway
  onlineMoveTimes[m.ply] = { by: m.by_color, t: Date.parse(m.created_at) };
  if (m.ply < onlineApplied) { olSyncClocks(); return; }       // our own move (already on screen) or a duplicate
  onlineIncoming.set(m.ply, m); olPump();
}
function olPump() {
  if (onlineReplaying || !onlineRoom) return;
  if (isAnimating) { clearTimeout(onlinePumpTimer); onlinePumpTimer = setTimeout(olPump, 80); return; }
  const m = onlineIncoming.get(onlineApplied);
  if (!m) { if (onlineIncoming.size) olCatchUp(); return; }      // a move is missing — fetch it
  onlineIncoming.delete(onlineApplied);
  const before = onlineApplied;
  executeMove(Math.floor(m.from_sq / 8), m.from_sq % 8, Math.floor(m.to_sq / 8), m.to_sq % 8, true);
  if (onlineApplied === before) { console.warn('desync at ply', m.ply); olHardReload(); return; }
  olSyncClocks();
  clearTimeout(onlinePumpTimer); onlinePumpTimer = setTimeout(olPump, 40);
}
function olOnMessage(m, fromHistory) {
  if (!m || m.id <= onlineLastMsgId) return;
  onlineLastMsgId = m.id;
  const mine = sbUser && m.user_id === sbUser.id;
  if (mine && !fromHistory) return;                              // already shown when we sent it
  const name = mine ? 'You' : (onlineRoom ? (m.user_id === onlineRoom.host_id ? onlineRoom.host_name : onlineRoom.guest_name) : 'Opponent');
  appendChatMessage(name || 'Opponent', m.body);
  if (!mine && !fromHistory) olNotifyChat(name || 'Opponent', m.body);
}
/* chat notification: red badge on the chat icon + a toast + beep/vibration (skipped while the chat is open) */
let olUnread = 0, olToastTimer = null;
function olNotifyChat(name, body) {
  const dd = olById('chat-dropdown');
  if (dd && dd.classList.contains('active')) return;
  olUnread++;
  const b = olById('chat-badge'); if (b) { b.textContent = olUnread > 9 ? '9+' : String(olUnread); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  const t = olById('chat-toast');
  if (t) { t.textContent = ''; const nm = olEl('b', null, name + ': '); t.appendChild(nm); t.appendChild(document.createTextNode(body)); t.classList.add('show');
    clearTimeout(olToastTimer); olToastTimer = setTimeout(() => t.classList.remove('show'), 4000); }
  try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  try {
    const ctx = (typeof audioCtx !== 'undefined' && audioCtx) ? audioCtx : null;
    if (ctx && ctx.state === 'running' && (typeof soundOn === 'undefined' || soundOn)) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.12);
    }
  } catch (e) {}
}
function olClearChatBadge() { olUnread = 0; const b = olById('chat-badge'); if (b) b.classList.remove('show'); const t = olById('chat-toast'); if (t) t.classList.remove('show'); }
function olOpenChatFromToast() { const dd = olById('chat-dropdown'); if (dd) dd.classList.add('active'); olClearChatBadge(); }

/* ------------------------------------------------------------------ room state, clocks, results */
function olApplyRoom(room, silent) {
  if (!room || !onlineRoom || room.id !== onlineRoom.id) return;
  const prev = onlineRoom.status;
  onlineRoom = room;
  if (room.server_now) onlineServerOffset = Date.parse(room.server_now) - Date.now();
  if (prev === 'waiting' && room.status === 'playing' && !silent) {
    appendChatMessage('System', `${olOpponentName()} joined. ${olColorName(room.turn)} moves first. Good luck!`);
    try { playSound('move'); } catch (e) {}
  }
  olUpdatePanel(); olSetNames(room); olUpdateDrawBar(); olSyncClocks(); updateUI();
  if (room.status === 'finished' || room.status === 'cancelled') olFinalizeWhenIdle();
  if (room.status === 'playing') {
    if (onlineApplied < room.ply && !onlineIncoming.has(onlineApplied)) olCatchUp();
  }
}
function olOpponentName() { const r = onlineRoom; if (!r) return 'Opponent'; return (r.host_id === sbUser.id ? r.guest_name : r.host_name) || 'Opponent'; }
function olSyncClocks() {
  const r = onlineRoom; if (!r) return;
  if (!(r.minutes > 0)) { baseMatchControl = Infinity; whiteMatchTime = blackMatchTime = Infinity; updateTimerDisplay(); updateTimerActiveBox(); return; }
  const total = r.minutes * 60; baseMatchControl = total;
  if (r.status === 'waiting' || !r.started_at) { whiteMatchTime = blackMatchTime = total; updateTimerDisplay(); updateTimerActiveBox(); return; }
  if (onlineMoveTimes.length !== onlineApplied) return;          // a local move is still being confirmed — keep ticking as is
  const used = { w: 0, b: 0 }; let prev = Date.parse(r.started_at);
  for (const mt of onlineMoveTimes) { if (!mt) continue; used[mt.by] += Math.max(0, (mt.t - prev) / 1000); prev = mt.t; }
  if (r.status === 'playing') used[turn] += Math.max(0, (Date.now() + onlineServerOffset - prev) / 1000);
  whiteMatchTime = Math.max(0, total - used.w); blackMatchTime = Math.max(0, total - used.b);
  updateTimerDisplay(); updateTimerActiveBox();
  if (r.status === 'playing' && !gameOver) { if (!timerInterval) startTimer(); else lastTickMs = performance.now(); }
  else stopTimer();
}
const OL_REASON = { checkmate: 'Checkmate', resign: 'Resignation', timeout: 'Time out', agreement: 'Draw by agreement', stalemate: 'Stalemate', insufficient: 'Insufficient material', counting: 'Counting rule', draw: 'Draw' };
function olFinalizeWhenIdle() {
  if (onlineResultShown) return;
  if (onlineIncoming.size || isAnimating || onlineReplaying) { setTimeout(olFinalizeWhenIdle, 150); return; }
  const r = onlineRoom; if (!r) return;
  if (r.status === 'cancelled') { appendChatMessage('System', 'This room was cancelled.'); onlineResultShown = true; return; }
  if (r.status !== 'finished') return;
  onlineResultShown = true; gameOver = true; stopTimer(); hideKingEmergency(); hideCountingBadge();
  const reason = OL_REASON[r.result_reason] || 'Game over';
  if (r.result === 'draw') showResultModal(null, reason, '🤝 The game is a draw.');
  else {
    const loser = r.result === 'w' ? 'b' : 'w';
    let detail = `👑 ${olColorName(r.result)} wins.`;
    if (r.result_reason === 'resign') detail = `🏳 ${olColorName(loser)} resigned. ${olColorName(r.result)} wins.`;
    if (r.result_reason === 'timeout') detail = `⏰ ${olColorName(loser)} ran out of time. ${olColorName(r.result)} wins.`;
    showResultModal(r.result, reason, detail);
  }
  olLoadProfile().catch(() => {});
}
function olSetNames(room) {
  const w = document.querySelector('#timer-box-w .side-header span:last-child'), b = document.querySelector('#timer-box-b .side-header span:last-child');
  if (!w || !b) return;
  if (!room || !room.guest_id) { w.textContent = 'WHITE • ស'; b.textContent = 'BLACK • ខ្មៅ'; return; }
  const nm = c => (room.host_color === c ? room.host_name : room.guest_name) || '?';
  w.textContent = 'WHITE • ' + nm('w'); b.textContent = 'BLACK • ' + nm('b');
}

/* ------------------------------------------------------------------ panel + buttons in the game screen */
function olSetStatus(text, dot) { const t = olById('online-status-text'); if (t) t.textContent = text; const d = olById('online-dot'); if (d) d.classList.toggle('connected', !!dot); }
function olUpdatePanel() {
  const info = olById('online-room-info'), dBtn = olById('ol-btn-draw'), rBtn = olById('ol-btn-resign'), iBtn = olById('ol-btn-invite');
  if (!info) return;
  const r = onlineRoom;
  const show = (el, on) => { if (el) el.style.display = on ? 'inline-flex' : 'none'; };
  if (!sbUser) { olSetStatus('Not signed in', false); info.textContent = ''; show(dBtn, false); show(rBtn, false); show(iBtn, false); return; }
  const me = sbProfile ? sbProfile.display_name : 'Player';
  if (!r) { olSetStatus('Signed in as ' + me, true); info.textContent = ''; show(dBtn, false); show(rBtn, false); show(iBtn, false); return; }
  show(iBtn, r.status === 'waiting');
  show(dBtn, r.status === 'playing'); show(rBtn, r.status === 'playing' || r.status === 'waiting');
  rBtn.textContent = r.status === 'waiting' ? '✕ Cancel room' : '🏳 Resign • ចុះចាញ់';
  if (r.status === 'waiting') { olSetStatus('Waiting for an opponent…', onlineConnected); info.textContent = `Room code: ${r.code}  •  ${olTimeLabel(r.minutes)}  •  you are ${olColorName(myRole)}`; }
  else if (r.status === 'playing') {
    const yours = r.turn === myRole;
    olSetStatus(`${me} (${olColorName(myRole)}) vs ${olOpponentName()} — ${yours ? 'YOUR TURN' : 'opponent’s turn'}`, onlineConnected);
    info.textContent = `Room ${r.code}  •  ${olTimeLabel(r.minutes)}`;
  } else { olSetStatus('Game finished', onlineConnected); info.textContent = `Room ${r.code}`; }
  if (r.draw_offer && r.draw_offer === myRole && r.status === 'playing') info.textContent += '  •  draw offered, waiting…';
}
async function olResign() {
  if (!onlineRoom) return;
  const waiting = onlineRoom.status === 'waiting';
  if (!confirm(waiting ? 'Cancel this room?' : 'Resign this game?')) return;
  try { const { data, error } = await sb.rpc('resign', { p_room: onlineRoom.id }); if (error) throw error; olApplyRoom(data); if (waiting) { olLeaveRoomView(); switchModeInternal('online'); } } catch (e) { alert(olErr(e)); }
}
async function olOfferDraw() {
  if (!onlineRoom || onlineRoom.status !== 'playing') return;
  try { const { data, error } = await sb.rpc('offer_draw', { p_room: onlineRoom.id }); if (error) throw error; olApplyRoom(data); appendChatMessage('System', 'Draw offer sent.'); } catch (e) { alert(olErr(e)); }
}
async function olRespondDraw(accept) {
  if (!onlineRoom) return;
  try { const { data, error } = await sb.rpc('respond_draw', { p_room: onlineRoom.id, p_accept: accept }); if (error) throw error; olApplyRoom(data); } catch (e) { alert(olErr(e)); }
}
function olUpdateDrawBar() {
  const r = onlineRoom, bar = olById('draw-offer-bar'); if (!bar) return;
  const on = r && r.status === 'playing' && r.draw_offer && r.draw_offer !== myRole;
  bar.style.display = on ? 'flex' : 'none';
}
function olHideDrawBar() { const b = olById('draw-offer-bar'); if (b) b.style.display = 'none'; }
function olInviteLink() { return location.origin + location.pathname + '?join=' + onlineRoom.code; }
async function olInvite() {
  if (!onlineRoom) return;
  const link = olInviteLink(), text = `Play Khmer Chess with me! Room code: ${onlineRoom.code}`;
  try { if (navigator.share) { await navigator.share({ title: 'អុកចត្រង្គ Khmer Chess', text, url: link }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + '\n' + link); appendChatMessage('System', 'Invite link copied. Send it to your friend.'); }
  catch (e) { prompt('Copy this invite link:', link); }
}

/* ------------------------------------------------------------------ start-up: invite links (?join=CODE) */
window.addEventListener('DOMContentLoaded', () => {
  olFillCreateForm(); olAuthTab('in');
  ['auth-email', 'auth-pass', 'auth-name'].forEach(id => olById(id).addEventListener('keydown', e => { if (e.key === 'Enter') olAuthSubmit(); }));
  olById('ol-join-code').addEventListener('keydown', e => { if (e.key === 'Enter') olJoinFromInput(); });
  const code = new URLSearchParams(location.search).get('join');
  if (code) {
    onlinePendingJoin = code.trim().toUpperCase();
    history.replaceState(null, '', location.pathname);
    setTimeout(() => switchModeInternal('online'), 200);
  }
});
