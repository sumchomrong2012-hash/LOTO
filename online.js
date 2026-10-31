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

const OL_TIMES = [[0, 'No clock'], [1, '1 min'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [20, '20 min'], [30, '30 min'], [60, '60 min']];
const OL_ERR = {
  not_signed_in: 'Please sign in first.', room_not_found: 'Room not found — check the code.',
  room_not_open: 'That room already has two players.', too_many_waiting_rooms: 'You already have 3 waiting rooms — cancel one first.',
  too_many_games: 'You have too many active games.', not_your_turn: 'It is not your turn.',
  bad_ply: 'Game was out of sync — reloading.', game_not_active: 'This game is not active.',
  not_in_room: 'You are not a player in this room.', name_taken: 'That display name is taken.',
  bad_name: 'Display name must be 2–24 characters.', not_expired: 'Time has not expired yet.',
  no_offer: 'There is no draw offer to answer.', bad_setup: 'That setup is not allowed.', passkey_required: 'This room needs a passcode.', wrong_passkey: 'Wrong passcode.', bad_passkey: 'Passcode must be 2–20 characters.', user_not_found: 'No player has that display name.', cannot_add_self: 'You cannot add yourself.', already_friends: 'You are already friends.', already_requested: 'Request already sent.', not_friends: 'You can only invite friends.', invite_not_found: 'That invitation is no longer valid.', too_many_invites: 'Too many pending invitations.', setup_done: 'You already finished your setup.', no_setup: 'The setup phase is over.', setup_pending: 'Both players must finish setting up first.', bad_avatar: 'That picture cannot be used.', no_profile: 'Profile missing — sign out and in again.'
};
function olAlert(msg) { olToast('⚠️ ' + msg); }
function olErr(e) { const m = (e && e.message) || String(e); for (const k in OL_ERR) if (m.includes(k)) return OL_ERR[k]; return m; }
function olEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function olById(id) { return document.getElementById(id); }
function olColorName(c) { return c === 'w' ? 'White' : 'Black'; }
function olMyColorIn(r) { return r.host_id === (sbUser && sbUser.id) ? r.host_color : (r.host_color === 'w' ? 'b' : 'w'); }
function olTimeLabel(m) { return m > 0 ? m + ' min' : 'No clock'; }

/* ------------------------------------------------------------------ hooks used by the game */
function onlineBlocked() {
  return currentMode === 'online' && (!onlineRoom || onlineRoom.status !== 'playing' || !!onlineRoom.setup_pending || turn !== myRole);
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
/* Web address of the game. Inside an installed Android app the page runs from file:// or a local address,
   so emails / invite links must point to the public web address from config.js (SITE_URL). */
function olSiteUrl() {
  const cfg = window.KHMER_CONFIG || {};
  if (cfg.SITE_URL && /^https?:\/\//.test(cfg.SITE_URL)) return cfg.SITE_URL;
  if (/^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return location.origin + location.pathname;
  return undefined;
}
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
  olUserSub(); olPresenceSub();
  if (onlinePendingJoin) { const c = onlinePendingJoin; onlinePendingJoin = null; olJoinByCode(c); return; }
  if (!onlineRoom) {
    const g = await olFindActiveGame();                              // a game is running: open it straight away
    if (g && currentMode === 'online') { await olEnterRoom(g); return; }
    openLobby();
  }
}
async function olFindActiveGame() {
  try {
    const { data, error } = await sb.rpc('my_rooms'); if (error || !data) return null;
    const live = data.filter(r => r.status === 'playing' && (Date.now() + onlineServerOffset - Date.parse(r.last_move_at || r.started_at || r.created_at)) < 86400000);
    live.sort((a, b) => Date.parse(b.last_move_at || b.started_at || 0) - Date.parse(a.last_move_at || a.started_at || 0));
    return live[0] || null;
  } catch (e) { return null; }
}
async function olLoadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', sbUser.id).maybeSingle();
  sbProfile = data || { display_name: (sbUser.email || 'Player').split('@')[0], wins: 0, losses: 0, draws: 0 };
  olAvatarCache[sbUser.id] = sbProfile.avatar || null;
}
function olSyncMenuClass() { const on = ['lobby-modal', 'auth-modal', 'friends-modal', 'pass-modal', 'pc-modal', 'notif-modal', 'pview-modal', 'profile-modal', 'dm-modal'].some(id => { const e = olById(id); return e && e.classList.contains('active'); }); document.body.classList.toggle('ol-menu-open', on); }
function olOpenAuth(tab) { olAuthTab(tab || 'in'); olById('auth-msg').textContent = ''; olById('auth-modal').classList.add('active'); olSyncMenuClass(); }
function olCloseAuth() { olById('auth-modal').classList.remove('active'); olSyncMenuClass(); }
function olAuthTab(t) {
  olById('auth-tab-in').classList.toggle('active', t === 'in'); olById('auth-tab-up').classList.toggle('active', t === 'up');
  olById('auth-name-wrap').style.display = t === 'up' ? 'flex' : 'none';
  olById('auth-go').textContent = t === 'up' ? 'Create account • បង្កើតគណនី' : 'Sign in • ចូលគណនី';
  olById('auth-go').dataset.mode = t;
  olById('auth-otp-wrap').style.display = 'none';
  olAuthMethod(olAuthMethodNow);
}
let olAuthMethodNow = (() => { try { return localStorage.getItem('khmerAuthMethod') === 'email' ? 'email' : 'phone'; } catch (e) { return 'phone'; } })();
let olPendingPhone = null;
function olAuthMethod(m) {                                    // phone number (default) or email
  olAuthMethodNow = m; try { localStorage.setItem('khmerAuthMethod', m); } catch (e) {}
  olById('auth-m-phone').classList.toggle('active', m === 'phone'); olById('auth-m-email').classList.toggle('active', m === 'email');
  olById('auth-phone-wrap').style.display = m === 'phone' ? 'flex' : 'none'; olById('auth-email-wrap').style.display = m === 'email' ? 'flex' : 'none';
  olById('auth-forgot').style.display = (m === 'email' && (olById('auth-go').dataset.mode || 'in') === 'in') ? 'inline' : 'none';
  const cc = (window.KHMER_CONFIG && window.KHMER_CONFIG.COUNTRY_CODE) || '855'; olById('auth-cc').textContent = '+' + cc;
}
function olAuthMsg(text, good) { const m = olById('auth-msg'); m.textContent = text; m.style.color = good ? '#6ee7b7' : '#fca5a5'; }
/* phone number -> digits with the country code (Cambodia +855 unless config.js says otherwise) */
function olNormalizePhone(raw) {
  const cc = String((window.KHMER_CONFIG && window.KHMER_CONFIG.COUNTRY_CODE) || '855');
  let d = String(raw || '').trim(); const plus = d.startsWith('+'); d = d.replace(/[^0-9]/g, '');
  if (!d) return null;
  if (plus) { /* already international */ }
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = cc + d.slice(1);
  else if (!d.startsWith(cc) || d.length <= 9) d = cc + d;
  return (d.length >= 8 && d.length <= 15) ? d : null;
}
function olAuthCreds() {
  const cfg = window.KHMER_CONFIG || {}, password = olById('auth-pass').value;
  if (olAuthMethodNow === 'email') {
    const email = olById('auth-email').value.trim(); if (!email || !password) throw new Error('Enter your email and password.');
    return { kind: 'email', creds: { email, password } };
  }
  const n = olNormalizePhone(olById('auth-phone').value);
  if (!n || !password) throw new Error(n ? 'Enter your password.' : 'Enter a valid phone number.');
  if ((cfg.PHONE_MODE || 'virtual') === 'sms') return { kind: 'sms', phone: '+' + n, creds: { phone: '+' + n, password } };
  return { kind: 'virtual', creds: { email: 'p' + n + '@' + (cfg.PHONE_EMAIL_DOMAIN || 'phone.khmerchess.invalid'), password } };
}
function olAuthHint(e, kind) {
  const m = (e && e.message) || String(e);
  if (kind === 'virtual' && /valid|invalid|domain/i.test(m) && /email/i.test(m)) return m + ' — Supabase refused the hidden address used for phone numbers. Set PHONE_EMAIL_DOMAIN in config.js to a domain that can receive mail, or use PHONE_MODE "sms".';
  if (kind === 'sms' && /phone|sms|provider/i.test(m) && /disabled|not enabled|unsupported|provider/i.test(m)) return m + ' — Enable the Phone provider (and an SMS service) in Supabase → Authentication → Providers.';
  if (/Invalid login credentials/i.test(m) && kind !== 'email') return 'Wrong phone number or password. Use the same phone number you registered with.';
  return olErr(e);
}
async function olAuthSubmit() {
  if (!olInit()) { olAuthMsg('Not configured: edit config.js'); return; }
  const mode = olById('auth-go').dataset.mode || 'in', btn = olById('auth-go');
  let cred; try { cred = olAuthCreds(); } catch (e) { olAuthMsg(e.message); return; }
  btn.disabled = true; olAuthMsg('Please wait…', true);
  try {
    if (mode === 'up') {
      const name = olById('auth-name').value.trim();
      if (name.length < 2 || name.length > 24) throw new Error('Display name must be 2–24 characters.');
      if (olById('auth-pass').value.length < 6) throw new Error('Password must be at least 6 characters.');
      const opts = { data: { display_name: name } }; if (cred.kind === 'email') opts.emailRedirectTo = olSiteUrl();
      const { data, error } = await sb.auth.signUp(Object.assign({}, cred.creds, { options: opts }));
      if (error) throw error;
      if (!data.session) {
        if (cred.kind === 'sms') { olPendingPhone = cred.phone; olById('auth-otp-wrap').style.display = 'flex'; olAuthMsg('We sent a code by SMS. Type it below.', true); btn.disabled = false; return; }
        olAuthMsg(cred.kind === 'virtual' ? 'Account created, but Supabase still wants an email confirmation. Turn OFF "Confirm email" in Supabase → Authentication → Providers → Email, then sign in.' : 'Account created. Check your email and tap the confirmation link, then sign in.', true);
        olAuthTab('in'); btn.disabled = false; return;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword(cred.creds);
      if (error) throw error;
    }
    olCloseAuth(); olById('auth-pass').value = '';
    await onlineEnterMode();
  } catch (e) { olAuthMsg(olAuthHint(e, cred.kind)); }
  btn.disabled = false;
}
async function olVerifyOtp() {
  const token = olById('auth-otp').value.trim(); if (!token || !olPendingPhone) { olAuthMsg('Type the SMS code.'); return; }
  olAuthMsg('Checking…', true);
  try {
    const { error } = await sb.auth.verifyOtp({ phone: olPendingPhone, token, type: 'sms' }); if (error) throw error;
    olPendingPhone = null; olById('auth-otp-wrap').style.display = 'none'; olCloseAuth(); olById('auth-pass').value = '';
    await onlineEnterMode();
  } catch (e) { olAuthMsg(olErr(e)); }
}
async function olForgotPassword() {
  if (!olInit()) return;
  const email = olById('auth-email').value.trim();
  if (!email) { olAuthMsg('Type your email above first.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: olSiteUrl() });
  if (error) olAuthMsg(olErr(error)); else olAuthMsg('Password reset email sent. Open the link on this device.', true);
}
async function olNewPassword() {
  const pw = prompt('Choose a new password (at least 6 characters):');
  if (!pw) return;
  const { error } = await sb.auth.updateUser({ password: pw });
  olAlert(error ? olErr(error) : 'Password updated.');
}
async function olSignOut() {
  if (!sb) return;
  closeLobby(); olLeaveRoomView(); olUserUnsub(); olPresenceUnsub(); olSeenReq = null;
  await sb.auth.signOut(); sbUser = null; sbProfile = null;
  olUpdatePanel(); olOpenAuth();
}
function olRename() { olOpenProfile(); }

/* ------------------------------------------------------------------ lobby */
function openLobby() {
  if (!olInit()) { olSetStatus('Not configured — edit config.js', false); return; }
  if (!sbUser) { olOpenAuth(); return; }
  olRenderLobbyHeader();
  olById('lobby-modal').classList.add('active'); olSyncMenuClass();
  olRefreshLobby();
  clearInterval(onlineLobbyTimer);
  onlineLobbyTimer = setInterval(() => { if (!document.hidden) olRefreshLobby(); }, 5000);
}
function closeLobby() { olById('lobby-modal').classList.remove('active'); olSyncMenuClass(); clearInterval(onlineLobbyTimer); onlineLobbyTimer = null; }
async function olRefreshLobby() {
  try { sb.rpc('cleanup_rooms').then(() => {}, () => {}); } catch (e) {} olLoadProfile().then(olRenderLobbyHeader).catch(() => {}); olLoadOpenRooms(); olRefreshInvites(); }
function olRenderLobbyHeader() {
  if (!sbProfile) return;
  olById('ol-who').textContent = sbProfile.display_name;
  olRenderAvatar(olById('ol-me-av'), sbProfile.avatar, sbProfile.display_name);
  const idb = olById('ol-id-box'); if (idb) { idb.style.cursor = 'pointer'; idb.onclick = () => olViewProfile(sbUser.id); }
  olById('ol-stats').textContent = `🏆 ${sbProfile.wins} wins • ${sbProfile.losses} losses • ${sbProfile.draws} draws`;
}
const OL_TURNS = [[0, 'No limit'], [30, '30 seconds'], [60, '1 minute'], [120, '2 minutes'], [180, '3 minutes'], [300, '5 minutes']];
function olFillCreateForm() {
  const t = olById('ol-new-time'); if (t.options.length) return;
  OL_TIMES.forEach(([m, l]) => { const o = olEl('option', null, l); o.value = m; if (m === 20) o.selected = true; t.appendChild(o); });
  const u = olById('ol-new-turn'); if (u && !u.options.length) OL_TURNS.forEach(([s, l]) => { const o = olEl('option', null, l); o.value = s; if (s === 120) o.selected = true; u.appendChild(o); });
}
/* create_room, with the "time per move" only when it is wanted; older databases (without update_v5.sql) still work */
async function olCreateRoomRpc(args, turnSec) {
  const a = Object.assign({}, args); if (turnSec > 0) a.p_turn_seconds = turnSec;
  let res = await sb.rpc('create_room', a);
  if (res.error && a.p_turn_seconds && /p_turn_seconds|schema cache|Could not find/i.test(res.error.message || '')) {
    delete a.p_turn_seconds; res = await sb.rpc('create_room', a);
    if (!res.error) olToast('⚠️ The time per move needs update_v5.sql in Supabase — the room was created without it.', true);
  }
  return res;
}
/* "Create room" asks first: with a passcode or without */
function olCreateRoom() {
  if (!olInit() || !sbUser) { olOpenAuth(); return; }
  olById('pc-input').value = ''; olById('pc-msg').textContent = '';
  olById('pc-input-wrap').style.display = 'none'; olById('pc-confirm').style.display = 'none'; olById('pc-choice').style.display = 'flex';
  olById('pc-modal').classList.add('active'); olSyncMenuClass();
}
function olPcClose() { olById('pc-modal').classList.remove('active'); olSyncMenuClass(); }
function olPcNo() { olPcClose(); olCreateRoomNow(''); }
function olPcYes() {
  olById('pc-choice').style.display = 'none'; olById('pc-input-wrap').style.display = 'flex'; olById('pc-confirm').style.display = 'flex';
  olById('pc-msg').textContent = ''; setTimeout(() => { try { olById('pc-input').focus(); } catch (e) {} }, 200);
}
function olPcBack() { olById('pc-input-wrap').style.display = 'none'; olById('pc-confirm').style.display = 'none'; olById('pc-choice').style.display = 'flex'; }
function olPcConfirm() {
  const v = olById('pc-input').value.trim();
  if (v.length < 2 || v.length > 20) { olById('pc-msg').textContent = 'Passcode must be 2–20 characters.'; return; }
  olPcClose(); olCreateRoomNow(v);
}
async function olCreateRoomNow(pass) {
  const btn = olById('ol-create-btn'); btn.disabled = true;
  try {
    try { const { data: mine } = await sb.rpc('my_rooms'); for (const r of (mine || [])) { if (r.status === 'waiting' && r.host_id === sbUser.id) await sb.rpc('resign', { p_room: r.id }); } } catch (e) {}   // one open room at a time
    const args = {
      p_color: olById('ol-new-color').value, p_minutes: Number(olById('ol-new-time').value),
      p_first_turn: olById('ol-new-first').value, p_public: olById('ol-new-public').checked
    };
    if (pass) { if (pass.length < 2) throw new Error('bad_passkey'); args.p_passkey = pass; }
    const { data, error } = await olCreateRoomRpc(args, Number(olById('ol-new-turn').value) || 0);
    if (error) throw error;
    await olEnterRoom(data);
  } catch (e) { olAlert(olErr(e)); }
  btn.disabled = false;
}
let olPassCode = null;
function olJoinMsg(text, good) { const m = olById('ol-join-msg'); if (m) { m.textContent = text; m.style.color = good ? '#6ee7b7' : '#fca5a5'; } }
async function olJoinByCode(code, passkey, fromBox) {
  code = (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) { olJoinMsg('Type the 6-letter room code first.'); return; }
  if (!sb || !sbUser) { onlinePendingJoin = code; olOpenAuth(); return; }
  olJoinMsg('Joining room ' + code + '…', true);
  try {
    const { data, error } = await sb.rpc('join_room', passkey ? { p_code: code, p_passkey: passkey } : { p_code: code });
    if (error) throw error;
    olJoinMsg(''); olClosePass();
    const inp = olById('ol-join-code'); if (inp) inp.value = '';
    await olEnterRoom(data);
  } catch (e) {
    const m = (e && e.message) || '';
    if (/passkey_required/.test(m)) { olJoinMsg(''); olAskPasskey(code, false); return; }
    if (/wrong_passkey/.test(m)) { olJoinMsg(''); olAskPasskey(code, true); return; }
    olJoinMsg('Could not join: ' + olErr(e)); olAlert(olErr(e));
    if (!olById('lobby-modal').classList.contains('active')) openLobby();
  }
}
function olAskPasskey(code, wrong) {
  olPassCode = code;
  olById('pass-text').textContent = `Room ${code} is locked. Ask the host for the passcode.`;
  olById('pass-msg').textContent = wrong ? 'Wrong passcode — try again.' : ''; olById('pass-input').value = '';
  olById('pass-modal').classList.add('active'); olSyncMenuClass();
  setTimeout(() => { try { olById('pass-input').focus(); } catch (e) {} }, 200);
}
function olClosePass() { olById('pass-modal').classList.remove('active'); olSyncMenuClass(); }
function olPassSubmit() {
  const v = olById('pass-input').value.trim();
  if (!v) { olById('pass-msg').textContent = 'Type the passcode.'; return; }
  olJoinByCode(olPassCode, v);
}
function olJoinFromInput() { olJoinByCode(olById('ol-join-code').value); }
function olRoomRow(r, mode) {
  const row = olEl('div', 'ol-row'); const meta = olEl('div', 'ol-meta');
  const mine = mode === 'mine';
  const myC = mine ? olMyColorIn(r) : (r.host_color === 'w' ? 'b' : 'w');
  const opp = mine ? (r.host_id === sbUser.id ? r.guest_name : r.host_name) : r.host_name;
  const l1 = olEl('div', 'ol-l1', (r.has_passkey ? '🔒 ' : '') + (mine ? (opp ? 'vs ' + opp : 'Waiting for an opponent…') : (r.host_name || 'Player')));
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
function olResetBoardForRoom(keepChat) {
  stopTimer(); hideKingEmergency(); hideCountingBadge();
  countingActive = false; countingUsedOnce = false; countingRegime = null;
  setupStandardPosition(); olApplySetupsToBoard();
  capturedPieces = { w: [], b: [] }; turn = onlineRoom.first_turn || 'w'; moveNumber = 1;
  selectedSquare = null; legalMovesCache = []; lastMove = null; historyStack = []; redoStack = [];
  gameOver = false; isAnimating = false; aiSide = 'off';
  onlineApplied = 0; onlineMoveTimes = []; onlineIncoming.clear(); onlineResultShown = false;
  baseTurnControl = onlineRoom.turn_seconds > 0 ? onlineRoom.turn_seconds : Infinity;
  baseMatchControl = onlineRoom.minutes > 0 ? onlineRoom.minutes * 60 : Infinity;
  whiteMatchTime = blackMatchTime = baseMatchControl; whiteTurnTime = blackTurnTime = baseTurnControl;
  olById('result-modal').classList.remove('active');
  if (!keepChat) { olById('chat-messages').textContent = ''; onlineLastMsgId = 0; }
}
async function olEnterRoom(room) {
  olIncomingRematch = null; olHideRematchBar(); olSetups = null; olHideSetupUI();
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
  const [r, m, c, su, vo] = await Promise.all([
    sb.rpc('get_room', { p_room: id }),
    sb.from('moves').select('*').eq('room_id', id).order('ply'),
    sb.from('room_messages').select('*').eq('room_id', id).order('id'),
    sb.from('room_setups').select('color,pieces').eq('room_id', id),
    sb.from('voice_messages').select('id,user_id,seconds,created_at').eq('room_id', id).order('id')
  ]);
  if (token !== onlineLoadToken) return;               // user moved on to another room
  if (r.error) { appendChatMessage('System', '⚠️ ' + olErr(r.error)); return; }
  onlineRoom = r.data; onlineServerOffset = Date.parse(r.data.server_now) - Date.now();
  olSetups = (!r.data.setup_pending && !su.error && su.data && su.data.length) ? su.data : null;
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
  olLastVoiceId = 0;
  const hist = [];                                                    // text + voice, in the order they were sent
  (c.data || []).forEach(x => hist.push({ t: Date.parse(x.created_at), m: x }));
  ((vo && !vo.error && vo.data) || []).forEach(x => hist.push({ t: Date.parse(x.created_at), v: x }));
  hist.sort((p, q2) => p.t - q2.t);
  hist.forEach(h => { if (h.m) olOnMessage(h.m, true); else olOnVoice(h.v, true); });
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
function olLeaveRoomView() { clearInterval(olClockWatch); clearInterval(olBeatTimer); olHideSetupUI(); olSetups = null; olIncomingRematch = null; olHideRematchBar(); olClearChatBadge(); olUnsubscribe(); onlineLoadToken++; onlineLoading = false; onlineRoom = null; onlineIncoming.clear(); olHideDrawBar(); olSetNames(null); olUpdatePanel(); }
function onlineLeave() {                               // called by the game whenever the mode is switched / reset
  olLeaveRoomView(); closeLobby(); olCloseAuth(); olCloseFriends(); olClosePass(); olCloseNotifs(); olClosePView(); onlineReplaying = false;
}

/* ------------------------------------------------------------------ realtime */
function olSubscribe(roomId) {
  onlineChannel = sb.channel('room-' + roomId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moves', filter: 'room_id=eq.' + roomId }, p => olOnMove(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + roomId }, () => olRefreshRoom())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: 'room_id=eq.' + roomId }, p => olOnMessage(p.new, false))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_messages', filter: 'room_id=eq.' + roomId }, p => olOnVoice(p.new, false))
    .subscribe(status => {
      onlineConnected = (status === 'SUBSCRIBED'); olUpdatePanel();
      if (status === 'SUBSCRIBED') olResync();
    });
}
function olStartPolling() {                            // safety net: phones suspend websockets when the screen sleeps
  clearInterval(onlinePollTimer);
  onlinePollTimer = setInterval(() => { if (!document.hidden && onlineRoom) olResync(); }, 5000);
  clearInterval(olBeatTimer); olBeat();
  olBeatTimer = setInterval(olBeat, 20000);
  clearInterval(olClockWatch);
  olClockWatch = setInterval(() => {                       // the clock must run whenever the game is on
    const r = onlineRoom;
    if (r && r.status === 'playing' && !r.setup_pending && !gameOver && (r.minutes > 0 || r.turn_seconds > 0) && !timerInterval) olSyncClocks();
  }, 1000);
}
let olClockWatch = null, olBeatTimer = null;
function olBeat() { const r = onlineRoom; if (!r || document.hidden || !sb || (r.status !== 'waiting' && r.status !== 'playing')) return; sb.rpc('heartbeat', { p_room: r.id }).then(() => {}, () => {}); }
async function olResync() {
  if (!onlineRoom || !sb || onlineLoading) return;
  olRefreshRoom();
  if (onlineRoom.status === 'playing' || onlineRoom.status === 'finished') olCatchUp();
  try {
    const { data } = await sb.from('room_messages').select('*').eq('room_id', onlineRoom.id).gt('id', onlineLastMsgId).order('id');
    (data || []).forEach(x => olOnMessage(x, false));
  } catch (e) {}
  try {
    const { data } = await sb.from('voice_messages').select('id,user_id,seconds,created_at').eq('room_id', onlineRoom.id).gt('id', olLastVoiceId).order('id');
    (data || []).forEach(x => olOnVoice(x, false));
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && onlineRoom) { olResync(); olBeat(); } });
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
  if (document.hidden && turn === myRole && onlineRoom.status === 'playing') olNotify('turn', 'Your turn', `${olOpponentName()} made a move`, 'room');
  clearTimeout(onlinePumpTimer); onlinePumpTimer = setTimeout(olPump, 40);
}
function olOnMessage(m, fromHistory) {
  if (!m || m.id <= onlineLastMsgId) return;
  onlineLastMsgId = m.id;
  const mine = sbUser && m.user_id === sbUser.id;
  if (typeof m.body === 'string' && m.body.startsWith(OL_REMATCH)) {                 // rematch invitation (not a normal chat line)
    const code = m.body.slice(OL_REMATCH.length).trim().toUpperCase();
    if (!mine) {
      appendChatMessage(onlineRoom ? olOpponentName() : 'Opponent', '🔁 Rematch! Room code: ' + code);
      if (!fromHistory) olOnRematchInvite(code);
    }
    return;
  }
  if (mine && !fromHistory) return;                              // already shown when we sent it
  const name = mine ? 'You' : (onlineRoom ? (m.user_id === onlineRoom.host_id ? onlineRoom.host_name : onlineRoom.guest_name) : 'Opponent');
  appendChatMessage(name || 'Opponent', m.body);
  if (!mine && !fromHistory) olNotifyChat(name || 'Opponent', m.body);
}
/* chat notification: red badge on the chat icon + a toast + beep/vibration (skipped while the chat is open) */
let olUnread = 0, olToastTimer = null;
function olNotifyChat(name, body, kind) {
  const dd = olById('chat-dropdown');
  olNotify(kind || 'chat', name, body, 'chat');
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
  const prev = onlineRoom.status, prevPending = !!onlineRoom.setup_pending, prevOffer = onlineRoom.draw_offer, prevPly = onlineRoom.ply;
  onlineRoom = room;
  if (room.server_now) onlineServerOffset = Date.parse(room.server_now) - Date.now();
  if (prev === 'waiting' && room.status === 'playing' && !silent) {
    appendChatMessage('System', `${olOpponentName()} joined. ${olColorName(room.turn)} moves first. Good luck!`);
    olNotify('game', `${olOpponentName()} joined your room`, 'Time to start the game', 'room');
    try { playSound('move'); } catch (e) {}
  }
  olUpdatePanel(); olSetNames(room); olLoadAvatars(room); olPresenceUpdate(); olUpdateDrawBar(prevOffer); olSyncClocks(); updateUI();
  if (prevOffer === myRole && !room.draw_offer && room.status === 'playing' && room.ply === prevPly && !silent) olToast(`🤝 ${olOpponentName()} declined your draw offer.`);
  if (prevPending && !room.setup_pending && room.status === 'playing' && !silent) olOnSetupDone();
  olSetupCheck();
  if (room.status === 'finished' || room.status === 'cancelled') olFinalizeWhenIdle();
  if (room.status === 'playing') {
    if (onlineApplied < room.ply && !onlineIncoming.has(onlineApplied)) olCatchUp();
  }
}
function olOpponentName() { const r = onlineRoom; if (!r) return 'Opponent'; return (r.host_id === sbUser.id ? r.guest_name : r.host_name) || 'Opponent'; }
function olSyncClocks() {
  const r = onlineRoom; if (!r) return;
  const ts = r.turn_seconds > 0 ? r.turn_seconds : 0, hasMatch = r.minutes > 0;
  baseMatchControl = hasMatch ? r.minutes * 60 : Infinity; baseTurnControl = ts > 0 ? ts : Infinity;
  if (!hasMatch && !ts) { whiteMatchTime = blackMatchTime = Infinity; whiteTurnTime = blackTurnTime = Infinity; updateTimerDisplay(); updateTimerActiveBox(); return; }
  if (r.status === 'waiting' || !r.started_at || r.setup_pending) { whiteMatchTime = blackMatchTime = baseMatchControl; whiteTurnTime = blackTurnTime = baseTurnControl; updateTimerDisplay(); updateTimerActiveBox(); return; }
  if (onlineMoveTimes.length !== onlineApplied) return;          // a local move is still being confirmed — keep ticking as is
  const used = { w: 0, b: 0 }; let prev = Date.parse(r.started_at);
  for (const mt of onlineMoveTimes) { if (!mt) continue; used[mt.by] += Math.max(0, (mt.t - prev) / 1000); prev = mt.t; }
  const nowS = Date.now() + onlineServerOffset, sinceLast = Math.max(0, (nowS - prev) / 1000);
  if (r.status === 'playing') used[turn] += sinceLast;
  whiteMatchTime = hasMatch ? Math.max(0, baseMatchControl - used.w) : Infinity; blackMatchTime = hasMatch ? Math.max(0, baseMatchControl - used.b) : Infinity;
  if (ts > 0) {                                                  // time per move: the player to move has what is left of it
    const left = Math.max(0, ts - sinceLast);
    if (r.status === 'playing') { if (turn === 'w') { whiteTurnTime = left; blackTurnTime = ts; } else { blackTurnTime = left; whiteTurnTime = ts; } }
    else whiteTurnTime = blackTurnTime = ts;
  } else whiteTurnTime = blackTurnTime = Infinity;
  updateTimerDisplay(); updateTimerActiveBox();
  if (r.status === 'playing' && !r.setup_pending && !gameOver) { if (!timerInterval) startTimer(); else lastTickMs = performance.now(); }
  else stopTimer();
}
const OL_REASON = { checkmate: 'Checkmate', resign: 'Resignation', timeout: 'Time out', agreement: 'Draw by agreement', stalemate: 'Stalemate', insufficient: 'Insufficient material', counting: 'Counting rule', draw: 'Draw' };
function olFinalizeWhenIdle() {
  if (onlineResultShown) return;
  if (onlineIncoming.size || isAnimating || onlineReplaying) { setTimeout(olFinalizeWhenIdle, 150); return; }
  const r = onlineRoom; if (!r) return;
  if (r.status === 'cancelled') {
    onlineResultShown = true; olHideSetupUI();
    if (olCancelledByMe) { olCancelledByMe = false; return; }
    const opp = r.guest_id ? olOpponentName() : null;
    const msg = opp ? `${opp} has left the room, so the room was cancelled.` : 'This room was closed because nobody was online.';
    appendChatMessage('System', msg); olNotify('game', 'Room cancelled', msg, 'lobby');
    askConfirm('👋 Room cancelled', msg, 'OK • Lobby', () => switchModeInternal('online'), true);
    return;
  }
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
  const defaults = { w: 'WHITE • ស', b: 'BLACK • ខ្មៅ' };
  for (const c of ['w', 'b']) {
    const box = olById('timer-box-' + c), span = box && box.querySelector('.side-header .side-name'), av = box && box.querySelector('.side-av'); if (!span) continue;
    let uid = null, name = null;
    if (room) { if (room.host_color === c) { uid = room.host_id; name = room.host_name; } else { uid = room.guest_id; name = room.guest_name; } }
    span.textContent = ''; span.onclick = null; if (av) { av.textContent = ''; av.onclick = null; }
    if (!uid || !name) { box.classList.remove('has-av'); span.className = 'side-name'; span.textContent = defaults[c]; continue; }
    box.classList.add('has-av'); span.className = 'side-name ol-who';
    olRenderAvatar(av, olAvatarCache[uid], name);
    span.appendChild(olEl('span', 'ol-nm', name));
    span.onclick = av.onclick = () => olViewProfile(uid);
  }
}
/* ------------------------------------------------------------------ profile picture + name */
let olAvatarCache = {};                 // user id -> picture (data URL) or null
let pfPending;                          // undefined = picture unchanged, null = remove, string = new picture
function olAvatarOk(u) { return typeof u === 'string' && u.length < 70000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(u); }
function olRenderAvatar(el, avatar, name) {
  el.textContent = '';
  if (olAvatarOk(avatar)) { const i = document.createElement('img'); i.alt = ''; i.src = avatar; el.appendChild(i); }
  else el.textContent = (name || '?').trim().charAt(0).toUpperCase() || '?';
}
async function olLoadAvatars(room) {
  if (!room || !sb) return;
  const ids = [room.host_id, room.guest_id].filter(id => id && !(id in olAvatarCache));
  if (!ids.length) return;
  ids.forEach(id => { olAvatarCache[id] = null; });          // mark first so a failure is not retried every poll
  try {
    const { data, error } = await sb.from('profiles').select('id,avatar').in('id', ids);
    if (error) throw error;
    (data || []).forEach(r => { olAvatarCache[r.id] = r.avatar || null; });
    if (onlineRoom) olSetNames(onlineRoom);
  } catch (e) {}
}
function olResizeImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d'), m = Math.min(img.naturalWidth, img.naturalHeight);
      x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
      x.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Cannot read this picture. Try a JPG or PNG.')); };
    img.src = url;
  });
}
function olOpenProfile() {
  if (!sbProfile) return;
  pfPending = undefined; olById('pf-msg').textContent = ''; olById('pf-name').value = sbProfile.display_name;
  olRenderAvatar(olById('pf-avatar'), sbProfile.avatar, sbProfile.display_name);
  olById('profile-modal').classList.add('active');
}
function olCloseProfile() { olById('profile-modal').classList.remove('active'); }
function olPfMsg(text, good) { const m = olById('pf-msg'); m.textContent = text; m.style.color = good ? '#6ee7b7' : '#fca5a5'; }
function olPfRemove() { pfPending = null; olRenderAvatar(olById('pf-avatar'), null, olById('pf-name').value || sbProfile.display_name); }
async function olPfChosen(file) {
  if (!file) return;
  try { pfPending = await olResizeImage(file); olRenderAvatar(olById('pf-avatar'), pfPending, olById('pf-name').value); olPfMsg(''); }
  catch (e) { olPfMsg(e.message); }
}
async function olPfSave() {
  const name = olById('pf-name').value.trim(), btn = olById('pf-save'); btn.disabled = true; olPfMsg('Saving…', true);
  try {
    if (name !== sbProfile.display_name) {
      const { data, error } = await sb.rpc('set_display_name', { p_name: name }); if (error) throw error;
      sbProfile.display_name = data.display_name;
    }
    if (pfPending !== undefined) {
      const { data, error } = await sb.rpc('set_avatar', { p_avatar: pfPending });
      if (error) { if (/set_avatar|schema cache|PGRST202|bad_avatar/i.test(error.message)) throw new Error('Picture could not be saved. Run update_avatar.sql in Supabase first.'); throw error; }
      sbProfile.avatar = data.avatar || null;
    }
    olAvatarCache[sbUser.id] = sbProfile.avatar || null;
    olRenderLobbyHeader(); olUpdatePanel();
    if (onlineRoom) { olRefreshRoom().then(() => olSetNames(onlineRoom)); olSetNames(onlineRoom); }
    olCloseProfile();
  } catch (e) { olPfMsg(olErr(e)); }
  btn.disabled = false;
}
window.addEventListener('DOMContentLoaded', () => { const f = olById('pf-file'); if (f) f.addEventListener('change', () => { olPfChosen(f.files[0]); f.value = ''; }); });

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
  show(dBtn, r.status === 'playing' && !r.setup_pending); show(rBtn, r.status === 'playing' || r.status === 'waiting');
  rBtn.textContent = (r.status === 'waiting' || r.setup_pending) ? '✕ Cancel room' : '🏳 Resign • ចុះចាញ់';
  if (r.status === 'waiting') { olSetStatus('Waiting for an opponent…', onlineConnected); info.textContent = `Room code: ${r.code}  •  ${olTimeLabel(r.minutes)}  •  you are ${olColorName(myRole)}`; }
  else if (r.status === 'playing' && r.setup_pending) {
    const mine = olReadyOf(r, myRole), theirs = olReadyOf(r, myRole === 'w' ? 'b' : 'w');
    olSetStatus(`Setting up pieces — you: ${mine ? 'ready ✓' : 'choosing…'} • ${olOpponentName()}: ${theirs ? 'ready ✓' : 'choosing…'}`, onlineConnected);
    info.textContent = `Room ${r.code}  •  ${olTimeLabel(r.minutes)}  •  the clock starts when both are ready`;
  }
  else if (r.status === 'playing') {
    const yours = r.turn === myRole;
    olSetStatus(`${me} (${olColorName(myRole)}) vs ${olOpponentName()} — ${yours ? 'YOUR TURN' : 'opponent’s turn'}`, onlineConnected);
    info.textContent = `Room ${r.code}  •  ${olTimeLabel(r.minutes)}`;
  } else { olSetStatus('Game finished', onlineConnected); info.textContent = `Room ${r.code}`; }
  if (r.draw_offer && r.draw_offer === myRole && r.status === 'playing') info.textContent += '  •  draw offered, waiting…';
}
let olCancelledByMe = false;
async function olResign() {
  if (!onlineRoom) return;
  const waiting = onlineRoom.status === 'waiting' || !!onlineRoom.setup_pending;
  askConfirm(waiting ? 'Cancel this room?' : 'Resign this game?', waiting ? 'The room will be closed.' : 'You will lose this game.', waiting ? 'Yes, cancel' : 'Yes, resign', async () => {
    try { if (waiting) olCancelledByMe = true; const { data, error } = await sb.rpc('resign', { p_room: onlineRoom.id }); if (error) throw error; olHideSetupUI(); olApplyRoom(data); if (waiting) { olLeaveRoomView(); switchModeInternal('online'); } } catch (e) { olCancelledByMe = false; olAlert(olErr(e)); }
  });
}
async function olOfferDraw() {
  if (!onlineRoom || onlineRoom.status !== 'playing') return;
  try { const { data, error } = await sb.rpc('offer_draw', { p_room: onlineRoom.id }); if (error) throw error; olApplyRoom(data); appendChatMessage('System', 'Draw offer sent.'); } catch (e) { olAlert(olErr(e)); }
}
async function olRespondDraw(accept) {
  if (!onlineRoom) return;
  try { const { data, error } = await sb.rpc('respond_draw', { p_room: onlineRoom.id, p_accept: accept }); if (error) throw error; olApplyRoom(data); } catch (e) { olAlert(olErr(e)); }
}
function olUpdateDrawBar(prevOffer) {
  const r = onlineRoom, bar = olById('draw-offer-bar'), sent = olById('draw-sent-bar'); if (!bar) return;
  const playing = r && r.status === 'playing' && !r.setup_pending;
  const incoming = !!(playing && r.draw_offer && r.draw_offer !== myRole);
  const mine = !!(playing && r.draw_offer && r.draw_offer === myRole);
  bar.style.display = incoming ? 'flex' : 'none';
  if (sent) { sent.style.display = mine ? 'flex' : 'none'; if (mine) olById('draw-sent-text').textContent = `🤝 Draw offer sent — waiting for ${olOpponentName()}…`; }
  if (incoming && prevOffer !== r.draw_offer) {            // a new offer just arrived
    appendChatMessage('System', `${olOpponentName()} offers a draw.`);
    olNotify('draw', `${olOpponentName()} offers a draw`, 'Accept or decline in the game', 'room');
    try { if (navigator.vibrate) navigator.vibrate([80, 40, 80]); playSound('check'); } catch (e) {}
  }
}
let olToastTimer2 = null;
function olToast(text, noChat) {
  const t = olById('ol-toast'); if (!t) return;
  t.textContent = text; t.classList.add('show');
  clearTimeout(olToastTimer2); olToastTimer2 = setTimeout(() => t.classList.remove('show'), 4000);
  if (!noChat) appendChatMessage('System', text.replace(/^\S+\s/, ''));
}
function olHideDrawBar() { const b = olById('draw-offer-bar'); if (b) b.style.display = 'none'; const s = olById('draw-sent-bar'); if (s) s.style.display = 'none'; }
function olInviteLink() { return (olSiteUrl() || (location.origin + location.pathname)) + '?join=' + onlineRoom.code; }
async function olInvite() {
  if (!onlineRoom) return;
  const link = olInviteLink(), text = `Play Khmer Chess with me! Room code: ${onlineRoom.code}`;
  try { if (navigator.share) { await navigator.share({ title: 'អុកចត្រង្គ Khmer Chess', text, url: link }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + '\n' + link); appendChatMessage('System', 'Invite link copied. Send it to your friend.'); }
  catch (e) { prompt('Copy this invite link:', link); }
}


/* ------------------------------------------------------------------ generic confirm window */
function askConfirm(title, text, okLabel, cb, single) {
  olById('ask-title').textContent = title; olById('ask-text').textContent = text;
  const ac = olById('ask-cancel'); if (ac) ac.style.display = single ? 'none' : '';
  const ok = olById('ask-ok'); ok.textContent = okLabel || 'OK';
  ok.onclick = () => { olById('ask-modal').classList.remove('active'); if (cb) cb(); };
  olById('ask-modal').classList.add('active');
}
function askCancel() { olById('ask-modal').classList.remove('active'); }

/* ------------------------------------------------------------------ result: win / loss event, record, play again */
const OL_REMATCH = '🔁REMATCH:';
let olIncomingRematch = null;
function olUndecorateResult() {
  const c = document.querySelector('#result-modal .modal-content'); if (c) c.classList.remove('res-win', 'res-loss', 'res-draw');
  const o = olById('result-online'), s = olById('result-std'); if (o) o.style.display = 'none'; if (s) s.style.display = 'flex';
}
function olDecorateResult(winner, title, detail) {
  const outcome = !winner ? 'draw' : (winner === myRole ? 'win' : 'loss');
  const c = document.querySelector('#result-modal .modal-content');
  c.classList.remove('res-win', 'res-loss', 'res-draw'); c.classList.add('res-' + outcome);
  olById('result-icon').textContent = outcome === 'win' ? '🏆' : outcome === 'loss' ? '💔' : '🤝';
  olById('result-title').textContent = outcome === 'win' ? 'YOU WIN! • អ្នកឈ្នះ' : outcome === 'loss' ? 'You lost • អ្នកចាញ់' : 'Draw • ស្មើ';
  olById('result-detail').textContent = `${title}. ${detail}`;
  olById('result-online').style.display = 'block'; olById('result-std').style.display = 'none';
  olUpdateRematchButton();
  olFillResultStats();
  olResultEffect(outcome);
}
function olUpdateRematchButton() {
  const b = olById('res-rematch-btn'); if (!b) return;
  b.textContent = olIncomingRematch ? '🔁 Accept rematch!' : '🔁 Play again';
  b.classList.toggle('btn-warning', !!olIncomingRematch); b.classList.toggle('btn-online', !olIncomingRematch);
}
async function olFillResultStats() {
  const box = olById('result-stats'); if (!box || !sb || !sbUser || !onlineRoom) return;
  const room = onlineRoom, me = sbUser.id, opp = room.host_id === me ? room.guest_id : room.host_id, oppName = olOpponentName();
  box.textContent = sbProfile ? `Your record: 🏆 ${sbProfile.wins} win • ❌ ${sbProfile.losses} loss • 🤝 ${sbProfile.draws} draw` : '';
  try {
    await olLoadProfile();
    box.textContent = `Your record: 🏆 ${sbProfile.wins} win • ❌ ${sbProfile.losses} loss • 🤝 ${sbProfile.draws} draw`;
    const { data, error } = await sb.from('rooms').select('host_id,guest_id,host_color,result,status').eq('status', 'finished').in('host_id', [me, opp]).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    let w = 0, l = 0, d = 0;
    (data || []).forEach(r => {
      if (!((r.host_id === me && r.guest_id === opp) || (r.host_id === opp && r.guest_id === me))) return;
      const myColor = r.host_id === me ? r.host_color : (r.host_color === 'w' ? 'b' : 'w');
      if (r.result === 'draw') d++; else if (r.result === myColor) w++; else if (r.result) l++;
    });
    box.appendChild(document.createElement('br'));
    box.appendChild(document.createTextNode(`You vs ${oppName}: ${w} – ${l}` + (d ? ` (${d} draw${d > 1 ? 's' : ''})` : '')));
  } catch (e) {}
}
function olResultEffect(outcome) {
  try {
    if (outcome === 'win') { olConfetti(); playSound('check'); setTimeout(() => playSound('move'), 220); if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 140]); }
    else if (outcome === 'loss') { playSound('check'); document.body.classList.add('ol-shake'); setTimeout(() => document.body.classList.remove('ol-shake'), 600); if (navigator.vibrate) navigator.vibrate([140, 70, 140]); }
  } catch (e) {}
}
function olConfetti() {
  const cv = olById('ol-confetti'); if (!cv) return;
  const dpr = window.devicePixelRatio || 1, W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr, g = cv.getContext('2d');
  cv.style.display = 'block';
  const colors = ['#fbbf24', '#f59e0b', '#34d399', '#60a5fa', '#f472b6', '#fde68a'];
  const parts = Array.from({ length: 110 }, () => ({ x: Math.random() * W, y: -Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr, s: (5 + Math.random() * 7) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[(Math.random() * colors.length) | 0] }));
  const t0 = performance.now();
  (function frame(now) {
    const el = now - t0; g.clearRect(0, 0, W, H);
    parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.04 * dpr; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - el / 4200); g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); g.restore(); });
    if (el < 4200) requestAnimationFrame(frame); else { g.clearRect(0, 0, W, H); cv.style.display = 'none'; }
  })(t0);
}

/* ------------------------------------------------------------------ rematch (play again with the same opponent) */
function olShowRematchBar(name) {
  const bar = olById('rematch-bar'); if (!bar) return;
  olById('rematch-text').textContent = `🔁 ${name} wants a rematch`;
  const resultOpen = olById('result-modal').classList.contains('active');
  bar.style.display = resultOpen ? 'none' : 'flex';
}
function olHideRematchBar() { const b = olById('rematch-bar'); if (b) b.style.display = 'none'; }
function olOnRematchInvite(code) {
  olIncomingRematch = code;
  olNotify('rematch', `${olOpponentName()} wants a rematch`, 'Tap to accept', 'rematch');
  olUpdateRematchButton(); olShowRematchBar(olOpponentName());
  try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
}
async function olRematch() {
  const old = onlineRoom; if (!old || !sb) return;
  olHideRematchBar();
  try {
    if (!olIncomingRematch) {                                    // did the opponent already invite us a moment ago?
      const { data: late } = await sb.from('room_messages').select('*').eq('room_id', old.id).gt('id', onlineLastMsgId).order('id');
      (late || []).forEach(x => olOnMessage(x, false));
    }
    if (olIncomingRematch) {
      const code = olIncomingRematch; olIncomingRematch = null;
      olById('result-modal').classList.remove('active'); await olJoinByCode(code); return;
    }
    const opp = olOpponentName();
    const { data, error } = await olCreateRoomRpc({ p_color: myRole === 'w' ? 'b' : 'w', p_minutes: old.minutes, p_first_turn: old.first_turn, p_public: false }, old.turn_seconds || 0);
    if (error) throw error;
    await sb.rpc('send_message', { p_room: old.id, p_body: OL_REMATCH + data.code });
    olById('result-modal').classList.remove('active');
    await olEnterRoom(data);
    appendChatMessage('System', `Rematch invite sent. Waiting for ${opp}… (code ${data.code})`);
  } catch (e) { olAlert(olErr(e)); }
}


/* ------------------------------------------------------------------ before the game: adjust your own pieces (handicap) */
let olSetups = null;                       // rows {color, pieces} once both players are ready; pieces = "std" or [[square, type], ...]
let setupGrid = {}, setupSel = null, setupEditorOpen = false, setupSubmitting = false, setupRows = [], setupCols = [], setupStd = {};
const SETUP_TOTAL = { q: 1, r: 2, b: 2, n: 2 };                    // pawns and promoted pawns: any number (16 pieces in total at most)
function olReadyOf(r, color) { return !!(color === 'w' ? r.setup_ready_w : r.setup_ready_b); }
function olApplySetupsToBoard() {                                    // boardState is the standard start when this runs
  if (!olSetups) return;
  const std = boardState.map(row => row.map(p => p ? { ...p } : null));
  for (const row of olSetups) {
    if (!Array.isArray(row.pieces)) continue;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = boardState[r][c]; if (p && p.c === row.color) boardState[r][c] = null; }
    for (const pc of row.pieces) {
      const sq = pc[0], t = pc[1], r = sq >> 3, c = sq & 7, o = std[r][c];
      boardState[r][c] = { t, c: row.color, m: !(o && o.c === row.color && o.t === t) };      // moved-flag off only if it stands on its normal square
    }
  }
}
async function olLoadSetups(roomId) {
  olSetups = null;
  try { const { data, error } = await sb.from('room_setups').select('color,pieces').eq('room_id', roomId); if (!error && data && data.length) olSetups = data; } catch (e) {}
  return olSetups;
}
function olHideSetupUI() { setupEditorOpen = false; const a = olById('setup-ask-modal'), b = olById('setup-modal'); if (a) a.classList.remove('active'); if (b) b.classList.remove('active'); }
function olSetupCheck() {
  const r = onlineRoom;
  if (!r || r.status !== 'playing' || !r.setup_pending) { olHideSetupUI(); return; }
  if (olReadyOf(r, myRole)) { olHideSetupUI(); return; }                 // I am ready: just wait for the other player
  if (!setupEditorOpen && !olById('setup-ask-modal').classList.contains('active')) olById('setup-ask-modal').classList.add('active');
  const theirs = olReadyOf(r, myRole === 'w' ? 'b' : 'w'), st = olById('setup-ask-status');
  st.textContent = `${olOpponentName()}: ${theirs ? 'ready ✓' : 'choosing…'}`; st.style.color = theirs ? '#6ee7b7' : '#fbbf24';
}
function olSetupNo() { olSubmitSetup(null); }
async function olSubmitSetup(pieces) {
  if (setupSubmitting || !onlineRoom) return; setupSubmitting = true;
  try {
    const { data, error } = await sb.rpc('submit_setup', { p_room: onlineRoom.id, p_pieces: pieces });
    if (error) throw error;
    olHideSetupUI(); olApplyRoom(data);
    if (data.setup_pending) appendChatMessage('System', `You are ready. Waiting for ${olOpponentName()}…`);
  } catch (e) {
    if (/setup_done|no_setup/.test((e && e.message) || '')) { olHideSetupUI(); olRefreshRoom(); } else olAlert(olErr(e));
  }
  setupSubmitting = false;
}
function olSetupCountOf(color) { const row = (olSetups || []).find(s => s.color === color); return row && Array.isArray(row.pieces) ? row.pieces.length : 16; }
function olNameOfColor(c) { const r = onlineRoom; if (!r) return olColorName(c); return (r.host_color === c ? r.host_name : r.guest_name) || olColorName(c); }
async function olOnSetupDone() {                                        // both ready: show the real starting position, clocks start
  olHideSetupUI();
  await olLoadSetups(onlineRoom.id);
  if (onlineApplied === 0) { olResetBoardForRoom(true); renderBoard(); updateUI(); }
  const custom = olSetups && olSetups.some(s => Array.isArray(s.pieces));
  appendChatMessage('System', custom ? 'Both players are ready — pieces were adjusted. Game on!' : 'Both players are ready — game on!');
  const nw = olSetupCountOf('w'), nb = olSetupCountOf('b');
  if (nw !== nb) { const first = nw > nb ? 'w' : 'b', fewer = first === 'w' ? 'b' : 'w'; appendChatMessage('System', `${olNameOfColor(first)} (${olColorName(first)}) moves first, because ${olNameOfColor(fewer)} (${olColorName(fewer)}) removed pieces.`); }
  olSyncClocks(); olUpdatePanel();
  try { playSound('move'); } catch (e) {}
}
function olSetupYes() {
  const color = myRole, keep = boardState;
  setupStandardPosition(); const std = boardState; boardState = keep;
  setupRows = color === 'w' ? [5, 6, 7] : [2, 1, 0];
  setupCols = color === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];     // shown the way you will see the real board
  setupStd = {};
  for (const r of setupRows) for (const c of setupCols) { const p = std[r][c]; if (p && p.c === color) setupStd[r * 8 + c] = p.t; }
  setupGrid = { ...setupStd }; setupSel = null; setupEditorOpen = true;
  olById('setup-ask-modal').classList.remove('active'); olById('setup-msg').textContent = '';
  olById('setup-modal').classList.add('active');
  olRenderSetup(); requestAnimationFrame(olSizeSetupBoard); setTimeout(olSizeSetupBoard, 150);
}
function olSetupCounts() {
  const n = { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0, u: 0 };
  for (const sq in setupGrid) n[setupGrid[sq]]++;
  return n;
}
function olSetupAvail(t) {                                           // pawns / promoted pawns: any number, as long as there is a free place (16 pieces max)
  if (t === 'p' || t === 'u') return 16 - Object.keys(setupGrid).length;
  return SETUP_TOTAL[t] - olSetupCounts()[t];
}
function olSetupGlyph(t) {
  const w = olEl('span', 'sx-pc');
  try { w.appendChild(buildPieceElement({ c: myRole, t: t === 'u' ? 'p' : t })); } catch (e) { w.textContent = unicodeFor({ c: myRole, t: t === 'u' ? 'p' : t }); }
  if (t === 'u') w.appendChild(olEl('span', 'chip-crown', '👑'));
  return w;
}
function olSizeSetupBoard() {
  const wrap = olById('setup-board-wrap'), board = olById('setup-board'); if (!wrap || !board) return;
  const w = wrap.clientWidth || 0; if (w < 80) return;
  const cell = Math.max(28, Math.min(52, Math.floor((w - 8) / 8)));
  board.style.width = (cell * 8) + 'px'; board.style.height = (cell * 3) + 'px';
  board.querySelectorAll('.sx-sq').forEach(c => { c.style.width = cell + 'px'; c.style.height = cell + 'px'; });
}
window.addEventListener('resize', () => { if (setupEditorOpen) olSizeSetupBoard(); });
window.addEventListener('orientationchange', () => { setTimeout(() => { if (setupEditorOpen) olSizeSetupBoard(); }, 250); });
function olRenderSetup() {
  const board = olById('setup-board'); board.textContent = '';
  for (const r of setupRows) for (const c of setupCols) {
    const sq = r * 8 + c, cell = olEl('div', 'sx-sq ' + (((r + c) % 2) ? 'dark' : 'light'));
    if (sq in setupGrid) cell.appendChild(olSetupGlyph(setupGrid[sq]));
    cell.addEventListener('click', () => olSetupTap(sq)); board.appendChild(cell);
  }
  const rack = olById('setup-rack'); rack.textContent = '';
  for (const t of ['q', 'r', 'b', 'n', 'p', 'u']) {
    const av = olSetupAvail(t), isP = (t === 'p' || t === 'u'), total = SETUP_TOTAL[t];
    const chip = olEl('div', 'sx-chip' + (setupSel === t ? ' sel' : '') + (av <= 0 ? ' empty' : ''));
    chip.appendChild(olSetupGlyph(t)); chip.appendChild(olEl('small', null, isP ? (av > 0 ? `+${av}` : 'full') : `${av}/${total}`));
    chip.addEventListener('click', () => { if (olSetupAvail(t) <= 0) return; setupSel = (setupSel === t) ? null : t; olById('setup-msg').textContent = ''; olRenderSetup(); });
    rack.appendChild(chip);
  }
  olSizeSetupBoard();
  const n = olSetupCounts(), cnt = Object.keys(setupGrid).length;
  const pw = n.p + n.u;
  olById('setup-count').textContent = `Your pieces: ${cnt} / 16` + (pw > 8 ? ` • ${pw} pawns` : '') + (cnt < 16 ? ' — your opponent gets an advantage' : '');
}
function olSetupMsg(text) { const m = olById('setup-msg'); m.textContent = text; m.style.color = '#fca5a5'; }
function olSetupTap(sq) {
  const t = setupGrid[sq];
  if (t) {
    if (setupSel === 'u' && t === 'p') { setupGrid[sq] = 'u'; setupSel = null; }                   // promote this pawn
    else if (t === 'k') { olSetupMsg('The King cannot be removed.'); return; }
    else delete setupGrid[sq];                                                                      // back to the rack
  } else if (setupSel && olSetupAvail(setupSel) > 0) {
    setupGrid[sq] = setupSel; if (olSetupAvail(setupSel) <= 0) setupSel = null;
  } else if (!setupSel) { olSetupMsg('Pick a piece below first, then tap an empty square.'); return; }
  olById('setup-msg').textContent = ''; olRenderSetup();
}
function olSetupReset() { setupGrid = { ...setupStd }; setupSel = null; olById('setup-msg').textContent = ''; olRenderSetup(); }
function olSetupCancel() { setupEditorOpen = false; olById('setup-modal').classList.remove('active'); olById('setup-ask-modal').classList.add('active'); }
function olSetupOk() {
  const same = Object.keys(setupStd).length === Object.keys(setupGrid).length && Object.keys(setupGrid).every(sq => setupStd[sq] === setupGrid[sq]);
  const pieces = same ? null : Object.keys(setupGrid).map(sq => [Number(sq), setupGrid[sq]]);
  olSubmitSetup(pieces);
}


/* ------------------------------------------------------------------ friends + invitations */
let olFriends = [], olFriendsInvite = false, olInvitedIds = new Set();
let olInvites = [], olInviteSeen = new Set(), olInviteBarId = null, olUserChannel = null, olUserTimer = null;
function olFriendsMsg(text, good) { const m = olById('fr-msg'); if (m) { m.textContent = text; m.style.color = good ? '#6ee7b7' : '#fca5a5'; } }
async function olOpenFriends(inviteMode) {
  if (!olInit() || !sbUser) { olOpenAuth(); return; }
  olFriendsInvite = !!(inviteMode && onlineRoom && onlineRoom.status === 'waiting');
  olById('fr-title').textContent = olFriendsInvite ? `Invite a friend to room ${onlineRoom.code}` : '👥 Friends • មិត្តភក្តិ';
  olById('fr-share').style.display = olFriendsInvite ? 'flex' : 'none';
  olFriendsMsg(''); olById('friends-modal').classList.add('active'); olSyncMenuClass();
  await olLoadFriends();
}
function olCloseFriends() { const m = olById('friends-modal'); if (m) m.classList.remove('active'); olSyncMenuClass(); }
async function olLoadAvatarsFor(ids) {
  const need = ids.filter(id => id && !(id in olAvatarCache)); if (!need.length) return;
  need.forEach(id => { olAvatarCache[id] = null; });
  try { const { data } = await sb.from('profiles').select('id,avatar').in('id', need); (data || []).forEach(r => { olAvatarCache[r.id] = r.avatar || null; }); } catch (e) {}
}
async function olLoadFriends() {
  const { data, error } = await sb.rpc('my_friends');
  if (error) { olFriendsMsg(/my_friends|schema cache/i.test(error.message) ? 'Friends are not set up yet. Run update_friends_passkey.sql in Supabase.' : olErr(error)); return; }
  olFriends = data || [];
  await olLoadAvatarsFor(olFriends.map(f => f.id));
  olRenderFriends();
}
function olStatusOf(id) { return olOnlineMap[id] === 'playing' ? 'playing' : (olOnlineMap[id] ? 'online' : 'offline'); }
const OL_STATUS_TEXT = { online: '🟢 Online', playing: '🎮 In a game', offline: '⚪ Offline' };
function olPersonRow(f, extra) {
  const row = olEl('div', 'ol-row'), wrap = olEl('span', 'ol-av-wrap'), av = olEl('span', 'ol-av mid'); olRenderAvatar(av, olAvatarCache[f.id], f.name);
  wrap.appendChild(av);
  if (f.state === 'friend') wrap.appendChild(olEl('span', 'ol-dot ' + olStatusOf(f.id)));
  const meta = olEl('div', 'ol-meta'); meta.appendChild(olEl('div', 'ol-l1', f.name));
  if (extra && extra.sub) meta.appendChild(olEl('div', 'ol-l2', extra.sub));
  wrap.style.cursor = meta.style.cursor = 'pointer'; wrap.onclick = meta.onclick = () => olViewProfile(f.id);
  row.appendChild(wrap); row.appendChild(meta);
  const act = olEl('div', 'ol-actions'); (extra && extra.buttons || []).forEach(b => act.appendChild(b)); row.appendChild(act);
  return row;
}
function olRenderFriends() {
  const inc = olById('fr-incoming'), list = olById('fr-list'); inc.textContent = ''; list.textContent = '';
  const rank = { online: 0, playing: 1, offline: 2 };
  const incoming = olFriends.filter(f => f.state === 'incoming'), mine = olFriends.filter(f => f.state !== 'incoming').sort((a, b) => (rank[olStatusOf(a.id)] - rank[olStatusOf(b.id)]) || a.name.localeCompare(b.name));
  olById('fr-in-card').style.display = incoming.length ? 'flex' : 'none';
  incoming.forEach(f => inc.appendChild(olPersonRow(f, { sub: 'wants to be your friend', buttons: [
    olBtn('Accept', 'btn btn-online', () => olFriendRespond(f.id, true)), olBtn('✕', 'btn', () => olFriendRespond(f.id, false))] })));
  if (!mine.length) list.appendChild(olEl('div', 'ol-empty', 'No friends yet — add a friend by their display name.'));
  mine.forEach(f => {
    const buttons = [];
    if (f.state === 'friend' && olFriendsInvite) buttons.push(olBtn(olInvitedIds.has(f.id) ? 'Invited ✓' : 'Invite', 'btn btn-online', () => olFriendInvite(f)));
    buttons.push(olBtn('✕', 'btn', () => askConfirm(f.state === 'friend' ? 'Remove friend?' : 'Cancel request?', f.name, 'Yes', () => olFriendRemove(f.id))));
    list.appendChild(olPersonRow(f, { sub: f.state === 'friend' ? OL_STATUS_TEXT[olStatusOf(f.id)] : 'request sent — waiting', buttons }));
  });
}
async function olFriendAdd() {
  const inp = olById('fr-name'), name = inp.value.trim(); if (!name) { olFriendsMsg('Type your friend’s display name.'); return; }
  olFriendsMsg('Sending…', true);
  try {
    const { data, error } = await sb.rpc('friend_request', { p_name: name }); if (error) throw error;
    inp.value = ''; olFriendsMsg(data.state === 'friend' ? `You and ${data.name} are now friends!` : `Request sent to ${data.name}.`, true);
    await olLoadFriends();
  } catch (e) { olFriendsMsg(olErr(e)); }
}
async function olFriendRespond(id, accept) { try { const { error } = await sb.rpc('friend_respond', { p_user: id, p_accept: accept }); if (error) throw error; await olLoadFriends(); } catch (e) { olFriendsMsg(olErr(e)); } }
async function olFriendRemove(id) { try { const { error } = await sb.rpc('friend_remove', { p_user: id }); if (error) throw error; await olLoadFriends(); } catch (e) { olFriendsMsg(olErr(e)); } }
async function olFriendInvite(f) {
  if (!onlineRoom) return;
  try {
    const { error } = await sb.rpc('send_invite', { p_room: onlineRoom.id, p_friend: f.id }); if (error) throw error;
    olInvitedIds.add(f.id); olRenderFriends(); olFriendsMsg(`Invitation sent to ${f.name}. They will see a Join button.`, true);
    appendChatMessage('System', `Invitation sent to ${f.name}.`);
  } catch (e) { olFriendsMsg(olErr(e)); }
}
function olUserSub() {
  if (!sb || !sbUser || olUserChannel) return;
  olUserChannel = sb.channel('user-' + sbUser.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invites', filter: 'to_user=eq.' + sbUser.id }, () => olRefreshInvites())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: 'to_user=eq.' + sbUser.id }, p => olOnDM(p.new))
    .subscribe();
  clearInterval(olUserTimer); let tk = 0; olUserTimer = setInterval(() => { if (document.hidden) return; olRefreshInvites(); if ((tk++ % 2) === 0) olPollFriends(); }, 6000);
  olRefreshInvites(); olPollFriends(); olLoadUnreadDMs();
}
function olUserUnsub() {
  if (olUserChannel && sb) { try { sb.removeChannel(olUserChannel); } catch (e) {} }
  olUserChannel = null; clearInterval(olUserTimer); olUserTimer = null; olHideInviteBar();
}
async function olRefreshInvites() {
  if (!sb || !sbUser) return;
  try {
    const { data, error } = await sb.rpc('my_invites'); if (error) return;
    olInvites = data || []; olRenderLobbyInvites();
    const fresh = olInvites.filter(i => !olInviteSeen.has(i.id));
    fresh.forEach(i => olInviteSeen.add(i.id));
    if (fresh.length) olShowInviteBar(fresh[0]);
    else if (olInviteBarId && !olInvites.some(i => i.id === olInviteBarId)) olHideInviteBar();
  } catch (e) {}
}
function olShowInviteBar(inv) {
  olInviteBarId = inv.id;
  olNotify('invite', `${inv.from_name} invites you to play`, olTimeLabel(inv.minutes), 'invite:' + inv.id);
  olById('invite-text').textContent = `🎮 ${inv.from_name} invites you to play (${olTimeLabel(inv.minutes)})`;
  olById('invite-bar').style.display = 'flex';
  try { if (navigator.vibrate) navigator.vibrate([80, 40, 80]); } catch (e) {}
}
function olHideInviteBar() { const b = olById('invite-bar'); if (b) b.style.display = 'none'; olInviteBarId = null; }
async function olInviteJoin(id) {
  id = id || olInviteBarId; if (!id) return;
  try {
    const { data, error } = await sb.rpc('accept_invite', { p_invite: id }); if (error) throw error;
    olHideInviteBar(); closeLobby(); olCloseFriends(); await olEnterRoom(data); olRefreshInvites();
  } catch (e) { olHideInviteBar(); olAlert(olErr(e)); olRefreshInvites(); }
}
async function olInviteDecline(id) {
  id = id || olInviteBarId; if (!id) return;
  try { await sb.rpc('decline_invite', { p_invite: id }); } catch (e) {}
  olHideInviteBar(); olRefreshInvites();
}
function olRenderLobbyInvites() {
  const card = olById('ol-invites-card'), box = olById('ol-invites-list'); if (!card || !box) return;
  box.textContent = ''; card.style.display = olInvites.length ? 'flex' : 'none';
  olInvites.forEach(i => {
    const row = olEl('div', 'ol-row'), meta = olEl('div', 'ol-meta');
    meta.appendChild(olEl('div', 'ol-l1', '🎮 ' + i.from_name)); meta.appendChild(olEl('div', 'ol-l2', `invites you • ${olTimeLabel(i.minutes)}`));
    row.appendChild(meta); const act = olEl('div', 'ol-actions');
    act.appendChild(olBtn('Join • ចូល', 'btn btn-online', () => olInviteJoin(i.id))); act.appendChild(olBtn('✕', 'btn', () => olInviteDecline(i.id)));
    row.appendChild(act); box.appendChild(row);
  });
}


/* ------------------------------------------------------------------ friend online status (Realtime presence) */
let olPresence = null, olOnlineMap = {};
function olMyStatus() { return onlineRoom && onlineRoom.status === 'playing' && !onlineRoom.setup_pending ? 'playing' : 'online'; }
function olPresenceSub() {
  if (olPresence || !sb || !sbUser) return;
  try {
    olPresence = sb.channel('presence-khmer', { config: { presence: { key: sbUser.id } } });
    olPresence.on('presence', { event: 'sync' }, () => {
      const st = olPresence.presenceState(); olOnlineMap = {};
      for (const k in st) { const arr = st[k]; olOnlineMap[k] = (arr && arr.length && arr[arr.length - 1].status) || 'online'; }
      if (olById('friends-modal').classList.contains('active')) olRenderFriends();
    }).subscribe(async s => { if (s === 'SUBSCRIBED') { try { await olPresence.track({ status: olMyStatus() }); } catch (e) {} } });
  } catch (e) { olPresence = null; }
}
function olPresenceUpdate() { if (olPresence) { try { olPresence.track({ status: olMyStatus() }); } catch (e) {} } }
function olPresenceUnsub() { if (olPresence && sb) { try { sb.removeChannel(olPresence); } catch (e) {} } olPresence = null; olOnlineMap = {}; }

/* ------------------------------------------------------------------ notifications (menu + phone notifications) */
const OL_NKEY = 'khmerNotifs';
let olNotifs = []; try { olNotifs = JSON.parse(localStorage.getItem(OL_NKEY) || '[]'); } catch (e) { olNotifs = []; }
let olSeenReq = null;
const OL_NICON = { message: '✉️', chat: '💬', voice: '🎤', invite: '🎮', friend: '👥', rematch: '🔁', draw: '🤝', turn: '⏳', game: '🎲' };
function olSaveNotifs() { try { localStorage.setItem(OL_NKEY, JSON.stringify(olNotifs.slice(0, 50))); } catch (e) {} }
function olNotify(kind, title, body, action) {
  const n = { id: Date.now() + Math.random(), ts: Date.now(), kind, title, body: String(body || '').slice(0, 120), action: action || null, read: false };
  olNotifs.unshift(n); olNotifs = olNotifs.slice(0, 50); olSaveNotifs(); olUpdateNotifBadge(); olDeviceNotify(title, n.body, kind);
  return n;
}
function olUnreadCount() { return olNotifs.filter(n => !n.read).length; }
function olUpdateNotifBadge() {
  const b = olById('notif-badge'), c = olUnreadCount();
  if (b) { b.textContent = c > 9 ? '9+' : String(c); b.classList.toggle('show', c > 0); }
  try { if (navigator.setAppBadge) { if (c) navigator.setAppBadge(c); else navigator.clearAppBadge(); } } catch (e) {}
}
function olDeviceNotify(title, body, tag) {                         // phone / PC notification while the game is in the background
  try {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    const show = reg => { if (reg && reg.showNotification) reg.showNotification(title, { body, tag, renotify: true, vibrate: [100, 60, 100] }); else new Notification(title, { body, tag }); };
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(show).catch(() => { try { new Notification(title, { body, tag }); } catch (e) {} });
    else show(null);
  } catch (e) {}
}
function olRegisterSW() { try { if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {} }
function olAgo(ts) { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago'; }
function olOpenNotifs() {
  olRenderNotifs(); olUpdatePermUI();
  olById('notif-modal').classList.add('active'); olSyncMenuClass();
  olNotifs.forEach(n => { n.read = true; }); olSaveNotifs(); olUpdateNotifBadge();
}
function olCloseNotifs() { const m = olById('notif-modal'); if (m) m.classList.remove('active'); olSyncMenuClass(); }
function olRenderNotifs() {
  const box = olById('notif-list'); box.textContent = '';
  if (!olNotifs.length) { box.appendChild(olEl('div', 'ol-empty', 'No notifications yet. New messages, invitations and friend requests will appear here.')); return; }
  olNotifs.forEach(n => {
    const row = olEl('div', 'ol-row' + (n.read ? '' : ' unread')), meta = olEl('div', 'ol-meta');
    row.appendChild(olEl('span', 'nt-ic', OL_NICON[n.kind] || '🔔'));
    meta.appendChild(olEl('div', 'ol-l1', n.title)); if (n.body) meta.appendChild(olEl('div', 'ol-l2', n.body));
    row.appendChild(meta); row.appendChild(olEl('span', 'nt-time', olAgo(n.ts)));
    row.style.cursor = 'pointer'; row.addEventListener('click', () => olNotifTap(n)); box.appendChild(row);
  });
}
function olNotifTap(n) {
  olCloseNotifs(); const a = n.action || '';
  if (a.startsWith('dm:')) { const [, id, ...nm] = a.split(':'); olOpenDM(id, nm.join(':')); return; }
  if (a === 'chat') { const dd = olById('chat-dropdown'); if (dd) dd.classList.add('active'); olClearChatBadge(); }
  else if (a.startsWith('invite:')) olInviteJoin(a.slice(7));
  else if (a === 'friends') olOpenFriends(false);
  else if (a === 'rematch') olRematch();
}
function olClearNotifs() { olNotifs = []; olSaveNotifs(); olUpdateNotifBadge(); olRenderNotifs(); }
function olPermState() { return ('Notification' in window) ? Notification.permission : 'unsupported'; }
function olUpdatePermUI() {
  const st = olPermState(), b = olById('notif-perm'), m = olById('notif-perm-msg'); if (!b) return;
  b.style.display = st === 'default' ? 'flex' : 'none';
  m.textContent = st === 'granted' ? '🔔 Phone notifications are ON (while the game is open in the background).' : st === 'denied' ? '🔕 Notifications are blocked. Allow them in your browser / phone settings for this site.' : st === 'unsupported' ? 'Phone notifications are not supported here — you still get alerts inside the game.' : 'Turn on phone notifications to be told about messages and invitations when the game is in the background.';
}
async function olEnableDeviceNotifs() {
  try { await Notification.requestPermission(); } catch (e) {}
  olRegisterSW(); olUpdatePermUI();
}
async function olPollFriends() {
  if (!sb || !sbUser) return;
  try {
    const { data, error } = await sb.rpc('my_friends'); if (error) return;
    const inc = (data || []).filter(f => f.state === 'incoming');
    if (olSeenReq === null) { olSeenReq = new Set(inc.map(f => f.id)); if (inc.length) olNotify('friend', `${inc.length} friend request${inc.length > 1 ? 's' : ''}`, inc.map(f => f.name).join(', '), 'friends'); return; }
    inc.forEach(f => { if (!olSeenReq.has(f.id)) { olSeenReq.add(f.id); olNotify('friend', `${f.name} sent you a friend request`, 'Tap to answer', 'friends'); olToast(`👥 ${f.name} sent you a friend request`, true); } });
  } catch (e) {}
}

/* ------------------------------------------------------------------ view an account (profile card) */
async function olH2H(oppId) {
  try {
    const me = sbUser.id;
    const { data, error } = await sb.from('rooms').select('host_id,guest_id,host_color,result,status').eq('status', 'finished').in('host_id', [me, oppId]).order('created_at', { ascending: false }).limit(200);
    if (error) return null;
    let w = 0, l = 0, d = 0;
    (data || []).forEach(r => {
      if (!((r.host_id === me && r.guest_id === oppId) || (r.host_id === oppId && r.guest_id === me))) return;
      const myColor = r.host_id === me ? r.host_color : (r.host_color === 'w' ? 'b' : 'w');
      if (r.result === 'draw') d++; else if (r.result === myColor) w++; else if (r.result) l++;
    });
    return { w, l, d };
  } catch (e) { return null; }
}
function olClosePView() { const m = olById('pview-modal'); if (m) m.classList.remove('active'); olSyncMenuClass(); }
async function olViewProfile(uid) {
  if (!sb || !uid) return;
  const body = olById('pv-body'); body.textContent = 'Loading…';
  olById('pview-modal').classList.add('active'); olSyncMenuClass();
  try {
    const { data, error } = await sb.from('profiles').select('id,display_name,wins,losses,draws,avatar').eq('id', uid).maybeSingle();
    if (error || !data) throw new Error('Profile not found');
    const me = uid === sbUser.id; olAvatarCache[uid] = data.avatar || null;
    if (!olFriends.length && !me) { try { const r = await sb.rpc('my_friends'); if (!r.error) olFriends = r.data || []; } catch (e) {} }
    body.textContent = '';
    const av = olEl('div', 'pf-avatar'); olRenderAvatar(av, data.avatar, data.display_name); av.style.margin = '0 auto';
    body.appendChild(av); body.appendChild(olEl('h3', 'pv-name', data.display_name));
    const st = olStatusOf(uid); body.appendChild(olEl('div', 'pv-status', me ? '🟢 You' : OL_STATUS_TEXT[st]));
    const total = data.wins + data.losses + data.draws, rate = total ? Math.round(100 * data.wins / total) : 0;
    const stats = olEl('div', 'pv-stats');
    [['🏆', data.wins, 'Wins'], ['❌', data.losses, 'Losses'], ['🤝', data.draws, 'Draws'], ['📊', rate + '%', 'Win rate']].forEach(([ic, v, lb]) => {
      const b = olEl('div', 'pv-stat'); b.appendChild(olEl('div', 'pv-v', ic + ' ' + v)); b.appendChild(olEl('div', 'pv-l', lb)); stats.appendChild(b);
    });
    body.appendChild(stats);
    const act = olEl('div', 'pv-actions');
    if (me) act.appendChild(olBtn('✏️ Edit profile', 'btn btn-primary', () => { olClosePView(); olOpenProfile(); }));
    else {
      const h = await olH2H(uid); if (h) body.appendChild(olEl('div', 'pv-h2h', `You vs ${data.display_name}: ${h.w} – ${h.l}` + (h.d ? ` (${h.d} draw${h.d > 1 ? 's' : ''})` : '')));
      const rel = olFriends.find(f => f.id === uid);
      if (rel && rel.state === 'friend') { act.appendChild(olEl('div', 'pv-status', '✓ Friends')); act.appendChild(olBtn('✉️ Leave a message', 'btn btn-primary', () => { olClosePView(); olOpenDM(uid, data.display_name); })); }
      else if (rel && rel.state === 'outgoing') act.appendChild(olEl('div', 'pv-status', 'Friend request sent'));
      else if (rel && rel.state === 'incoming') act.appendChild(olBtn('Accept friend request', 'btn btn-online', async () => { await olFriendRespond(uid, true); olViewProfile(uid); }));
      else act.appendChild(olBtn('➕ Add friend', 'btn btn-online', async () => {
        try { const r = await sb.rpc('friend_request', { p_name: data.display_name }); if (r.error) throw r.error; olFriends = []; olToast(`👥 Request sent to ${data.display_name}`, true); olViewProfile(uid); } catch (e) { olAlert(olErr(e)); }
      }));
    }
    body.appendChild(act);
  } catch (e) { body.textContent = ''; body.appendChild(olEl('div', 'ol-empty', olErr(e))); }
}

/* ------------------------------------------------------------------ chat: emoji + voice messages */
const OL_EMOJIS = '😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😮 😢 😭 😡 😅 🙏 👍 👎 👏 🙌 💪 👌 🔥 🎉 🏆 👑 ♟️ ⚔️ 🤝 ❤️ 💔 😴 🤯 🥳 😇 🤞 ✌️'.split(' ');
function olBuildEmoji() {
  const p = olById('chat-emoji-panel'); if (!p || p.dataset.built) return;
  OL_EMOJIS.forEach(e => { const b = olEl('button', 'emoji-btn', e); b.type = 'button'; b.addEventListener('click', () => olInsertEmoji(e)); p.appendChild(b); });
  p.dataset.built = '1';
}
function olToggleEmoji() { olBuildEmoji(); olById('chat-emoji-panel').classList.toggle('show'); }
function olInsertEmoji(e) {
  const i = olById('chat-input'); if (!i || i.disabled) { olToast('⚠️ Open Online mode and join a room to chat.', true); return; }
  const s = (i.selectionStart == null) ? i.value.length : i.selectionStart, en = (i.selectionEnd == null) ? s : i.selectionEnd;
  i.value = i.value.slice(0, s) + e + i.value.slice(en);
  try { i.focus(); i.setSelectionRange(s + e.length, s + e.length); } catch (x) {}
}
let olRec = null, olLastVoiceId = 0, olVoiceAudio = null; const olVoiceCache = {};
function olVoiceToggle() { if (olRec) olVoiceStop(true); else olVoiceStart(); }
async function olVoiceStart() {
  if (!onlineRoom || !sb) { olToast('⚠️ Join a room first.', true); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { olAlert('Voice messages are not supported on this device or app.'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const types = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    const mime = types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
    const rec = new MediaRecorder(stream, Object.assign({ audioBitsPerSecond: 24000 }, mime ? { mimeType: mime } : {}));
    const st = { rec, stream, chunks: [], t0: Date.now(), cancelled: false, mime, timer: null, stopper: null };
    rec.ondataavailable = e => { if (e.data && e.data.size) st.chunks.push(e.data); };
    rec.onstop = () => olVoiceFinish(st);
    olRec = st; rec.start();
    olById('chat-mic-btn').textContent = '⏹'; olById('chat-voice-bar').classList.add('show');
    st.timer = setInterval(() => { const s = Math.floor((Date.now() - st.t0) / 1000); olById('voice-time').textContent = `● Recording 0:${String(s).padStart(2, '0')} / 0:15`; }, 200);
    st.stopper = setTimeout(() => olVoiceStop(true), 15000);
  } catch (e) { olRec = null; olAlert('Microphone is not available. Please allow microphone access for this site/app.'); }
}
function olVoiceStop(send) {
  if (!olRec) return; olRec.cancelled = !send;
  try { olRec.rec.stop(); } catch (e) { olVoiceFinish(olRec); }
}
function olBlobToDataUrl(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }
async function olVoiceFinish(st) {
  if (olRec !== st) return; olRec = null;
  clearInterval(st.timer); clearTimeout(st.stopper);
  try { st.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  olById('chat-mic-btn').textContent = '🎤'; olById('chat-voice-bar').classList.remove('show');
  if (st.cancelled || !st.chunks.length) return;
  const secs = Math.max(1, Math.min(30, Math.round((Date.now() - st.t0) / 1000)));
  try {
    const blob = new Blob(st.chunks, { type: st.rec.mimeType || st.mime || 'audio/webm' });
    const raw = await olBlobToDataUrl(blob), base = (blob.type || 'audio/webm').split(';')[0];
    await olSendVoiceUrl(`data:${base};base64,${raw.split(',')[1]}`, secs);
  } catch (e) { olAlert('Could not send the voice message.'); }
}
async function olSendVoiceUrl(url, secs) {
  if (!onlineRoom || !sb) return;
  if (url.length > 145000) { olAlert('Voice message is too long.'); return; }
  const { data, error } = await sb.rpc('send_voice', { p_room: onlineRoom.id, p_audio: url, p_seconds: secs });
  if (error) { olAlert(/send_voice|schema cache/i.test(error.message) ? 'Voice messages are not set up yet. Run update_more.sql in Supabase.' : (/too_many_voice/.test(error.message) ? 'Too many voice messages — wait a moment.' : olErr(error))); return; }
  olVoiceCache[data] = url; if (data > olLastVoiceId) olLastVoiceId = data;
  olAppendVoice('You', data, secs, true);
}
function olOnVoice(v, fromHistory) {
  if (!v || v.id <= olLastVoiceId) return; olLastVoiceId = v.id;
  const mine = sbUser && v.user_id === sbUser.id;
  if (mine && !fromHistory) return;
  if (v.audio) olVoiceCache[v.id] = v.audio;
  const name = mine ? 'You' : olOpponentName();
  olAppendVoice(name, v.id, v.seconds, mine);
  if (!mine && !fromHistory) olNotifyChat(name, '🎤 Voice message', 'voice');
}
function olAppendVoice(name, id, secs, mine) {
  const box = olById('chat-messages'); if (!box) return;
  if (box.children.length === 1 && box.children[0].style.textAlign === 'center') box.innerHTML = '';
  const row = olEl('div'), b = olEl('b', null, name + ':'); b.style.color = mine ? '#47c8c1' : '#f472b6';
  const label = `▶ 0:${String(secs).padStart(2, '0')}`, btn = olEl('button', 'voice-play', label); btn.type = 'button'; btn.dataset.label = label;
  btn.addEventListener('click', () => olVoicePlay(id, btn));
  row.appendChild(b); row.appendChild(document.createTextNode(' ')); row.appendChild(btn); box.appendChild(row); box.scrollTop = box.scrollHeight;
}
function olVoiceReset() { document.querySelectorAll('.voice-play.playing').forEach(x => { x.classList.remove('playing'); x.textContent = x.dataset.label; }); }
async function olVoicePlay(id, btn) {
  try {
    if (olVoiceAudio) { try { olVoiceAudio.pause(); } catch (e) {} olVoiceAudio = null; const was = btn.classList.contains('playing'); olVoiceReset(); if (was) return; }
    let url = olVoiceCache[id];
    if (!url) {
      btn.textContent = '…';
      const { data, error } = await sb.from('voice_messages').select('audio').eq('id', id).maybeSingle();
      if (error || !data) throw new Error('missing'); url = olVoiceCache[id] = data.audio;
    }
    const a = new Audio(url); olVoiceAudio = a; btn.classList.add('playing'); btn.textContent = '⏸ ' + btn.dataset.label.slice(2);
    a.onended = () => { olVoiceAudio = null; olVoiceReset(); };
    await a.play();
  } catch (e) { olVoiceReset(); btn.textContent = btn.dataset.label; olAlert('This device cannot play this voice message.'); }
}


/* ------------------------------------------------------------------ messages to a friend ("leave a message") */
let olDmWith = null, olDmName = '', olSeenDm = new Set();
function olTimeHM(ts) { const d = new Date(ts); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
function olDmBubble(m) {
  const mine = sbUser && m.from_user === sbUser.id, b = olEl('div', 'dm-b ' + (mine ? 'me' : 'them'), m.body);
  b.appendChild(olEl('small', null, olTimeHM(m.created_at || Date.now()))); return b;
}
async function olOpenDM(uid, name) {
  if (!sb || !sbUser) { olOpenAuth(); return; }
  olDmWith = uid; olDmName = name || '';
  olById('dm-title').textContent = '✉️ ' + (name || ''); olById('dm-msg').textContent = ''; olById('dm-input').value = '';
  const box = olById('dm-thread'); box.textContent = 'Loading…';
  olById('dm-modal').classList.add('active'); olSyncMenuClass();
  try {
    const { data, error } = await sb.rpc('dm_thread', { p_other: uid, p_limit: 40 }); if (error) throw error;
    box.textContent = '';
    if (!data.length) box.appendChild(olEl('div', 'ol-empty', 'No messages yet. Write the first one!'));
    data.forEach(m => box.appendChild(olDmBubble(m)));
    box.scrollTop = box.scrollHeight;
  } catch (e) { box.textContent = ''; olById('dm-msg').textContent = /dm_thread|schema cache/i.test((e && e.message) || '') ? 'Messages are not set up yet. Run update_v4.sql in Supabase.' : olErr(e); }
}
function olCloseDM() { olDmWith = null; const m = olById('dm-modal'); if (m) m.classList.remove('active'); olSyncMenuClass(); olRefreshInboxBadge(); const ip = olById('chat-inbox-pane'); if (ip && ip.style.display !== 'none') olLoadInbox(); }
async function olDMSend() {
  const inp = olById('dm-input'), body = inp.value.trim(); if (!body || !olDmWith) return;
  inp.value = ''; olById('dm-msg').textContent = '';
  try {
    const { data, error } = await sb.rpc('send_dm', { p_to: olDmWith, p_body: body }); if (error) throw error;
    const box = olById('dm-thread'); if (box.querySelector('.ol-empty')) box.textContent = '';
    box.appendChild(olDmBubble({ from_user: sbUser.id, body, created_at: Date.now() })); box.scrollTop = box.scrollHeight;
  } catch (e) { inp.value = body; olById('dm-msg').textContent = olErr(e); }
}
async function olNameFor(uid) {
  const f = olFriends.find(x => x.id === uid); if (f) return f.name;
  try { const { data } = await sb.from('profiles').select('display_name').eq('id', uid).maybeSingle(); if (data) return data.display_name; } catch (e) {}
  return 'A friend';
}
async function olOnDM(m) {
  if (!m || olSeenDm.has(m.id)) return; olSeenDm.add(m.id);
  if (olDmWith === m.from_user && olById('dm-modal').classList.contains('active')) {
    const box = olById('dm-thread'); if (box.querySelector('.ol-empty')) box.textContent = '';
    box.appendChild(olDmBubble(m)); box.scrollTop = box.scrollHeight;
    try { sb.rpc('dm_thread', { p_other: m.from_user, p_limit: 1 }).then(() => {}, () => {}); } catch (e) {}
    return;
  }
  const name = await olNameFor(m.from_user);
  olRefreshInboxBadge(); { const ip = olById('chat-inbox-pane'); if (ip && ip.style.display !== 'none') olLoadInbox(); }
  olNotify('message', name, m.body, 'dm:' + m.from_user + ':' + name);
  olToast(`✉️ ${name}: ${String(m.body).slice(0, 60)}`, true);
}
async function olLoadUnreadDMs() {
  olRefreshInboxBadge();
  try {
    const { data, error } = await sb.rpc('my_unread_dms'); if (error || !data) return;
    data.forEach(x => { const key = x.from_id + '|' + x.last_at; if (olSeenDm.has(key)) return; olSeenDm.add(key); olNotify('message', `${x.from_name}${x.count > 1 ? ' (' + x.count + ')' : ''}`, x.last_body, 'dm:' + x.from_id + ':' + x.from_name); });
  } catch (e) {}
}


/* ------------------------------------------------------------------ messages inbox (tab in the message panel) */
function olSetInboxBadge(n) { const b = olById('ct-badge'); if (b) { b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('show', n > 0); } }
async function olRefreshInboxBadge() {
  if (!sb || !sbUser) return;
  try { const { data } = await sb.rpc('my_unread_dms'); olSetInboxBadge((data || []).reduce((n, x) => n + (x.count || 0), 0)); } catch (e) {}
}
function olChatTab(tab) {
  const room = tab === 'room';
  olById('chat-room-pane').style.display = room ? '' : 'none'; olById('chat-inbox-pane').style.display = room ? 'none' : 'block';
  olById('ct-room').classList.toggle('active', room); olById('ct-inbox').classList.toggle('active', !room);
  if (!room) olLoadInbox();
}
async function olLoadInbox() {
  const box = olById('inbox-list'); if (!box) return;
  if (!sb || !sbUser) { box.textContent = ''; box.appendChild(olEl('div', 'ol-empty', 'Sign in (Online mode) to see your messages.')); return; }
  try {
    const { data, error } = await sb.rpc('my_conversations'); if (error) throw error;
    await olLoadAvatarsFor((data || []).map(c => c.other_id));
    box.textContent = '';
    if (!data.length) { box.appendChild(olEl('div', 'ol-empty', 'No messages yet.')); olSetInboxBadge(0); return; }
    data.forEach(c => {
      const row = olEl('div', 'ol-row' + (c.unread ? ' unread' : '')), av = olEl('span', 'ol-av mid'); olRenderAvatar(av, olAvatarCache[c.other_id], c.other_name);
      const meta = olEl('div', 'ol-meta'); meta.appendChild(olEl('div', 'ol-l1', c.other_name));
      meta.appendChild(olEl('div', 'inbox-prev', (c.last_from_me ? '↪ ' : '') + c.last_body));
      row.appendChild(av); row.appendChild(meta);
      const right = olEl('div', 'ol-actions'); right.style.flexDirection = 'column'; right.style.alignItems = 'flex-end';
      right.appendChild(olEl('span', 'nt-time', olAgo(Date.parse(c.last_at))));
      if (c.unread) { const bd = olEl('span', 'chat-badge inline show', c.unread > 9 ? '9+' : String(c.unread)); bd.style.margin = '0'; right.appendChild(bd); }
      row.appendChild(right); row.style.cursor = 'pointer'; row.addEventListener('click', () => olOpenDM(c.other_id, c.other_name));
      box.appendChild(row);
    });
    olSetInboxBadge(data.reduce((n, c) => n + (c.unread || 0), 0));
  } catch (e) { box.textContent = ''; box.appendChild(olEl('div', 'ol-empty', /my_conversations|schema cache/i.test((e && e.message) || '') ? 'The inbox is not set up yet. Run update_v5.sql in Supabase.' : olErr(e))); }
}

/* ------------------------------------------------------------------ signed-in at start-up (so notifications work in every mode) */
async function olBootSession() {
  try {
    if (!olInit()) return;
    const { data } = await sb.auth.getSession();
    if (data && data.session) { sbUser = data.session.user; await olLoadProfile(); olUserSub(); olPresenceSub(); olRegisterSW(); }
  } catch (e) {}
  olUpdateNotifBadge();
}
window.addEventListener('DOMContentLoaded', () => { setTimeout(olBootSession, 300); });

/* ------------------------------------------------------------------ start-up: invite links (?join=CODE) */
window.addEventListener('DOMContentLoaded', () => {
  olFillCreateForm(); olAuthTab('in');
  ['auth-email', 'auth-pass', 'auth-name'].forEach(id => olById(id).addEventListener('keydown', e => { if (e.key === 'Enter') olAuthSubmit(); }));
  olById('ol-join-code').addEventListener('keydown', e => { if (e.key === 'Enter') olJoinFromInput(); });
  olById('pc-input').addEventListener('keydown', e => { if (e.key === 'Enter') olPcConfirm(); });
  const code = new URLSearchParams(location.search).get('join');
  if (code) {
    onlinePendingJoin = code.trim().toUpperCase();
    history.replaceState(null, '', location.pathname);
    setTimeout(() => switchModeInternal('online'), 200);
  }
});
