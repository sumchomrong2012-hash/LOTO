/* ==========================================
   LOTO KENO — Game logic
   Requires: supabase-client.js, auth.js loaded first
========================================== */

/* ---------- STATE ---------- */
let currentUser = null;
let balance = 0;
let isAdmin = false;
let selectedBets = new Set();
let queuedTransactions = [];  // [{ bets: [...], per: n }, ...]
let isDrawing = false;
let historyData = { num: [], ou: [] };
const MAX_COL = 18;

const $ = id => document.getElementById(id);

/* ---------- BUILD GRID ---------- */
(function buildGrid() {
  const grid = $('number-grid');
  for (let i = 1; i <= 80; i++) {
    const d = document.createElement('div');
    d.className = 'cell';
    d.id = `cell-${i}`;
    d.textContent = i;
    grid.appendChild(d);
  }
})();

/* ---------- BOOT ---------- */
(async function boot() {
  const user = await requireAuth();
  if (!user) return;
  currentUser = user;

  const profile = await getProfile(user.id);
  if (!profile) {
    alert('Profile missing. Contact admin.');
    return;
  }

  balance = Number(profile.balance);
  isAdmin = profile.role === 'admin';
  $('userEmail').textContent = profile.email;
  if (isAdmin) $('adminLink').style.display = 'inline';
  updateUI();
})();

/* ---------- BET SELECTION ---------- */
document.querySelectorAll('.b-opt').forEach(btn => {
  btn.onclick = () => {
    if (isDrawing) return;
    const val = btn.dataset.v;
    if (selectedBets.has(val)) {
      selectedBets.delete(val);
      btn.classList.remove('selected');
    } else {
      selectedBets.add(val);
      btn.classList.add('selected');
    }
  };
});

/* ---------- CONFIRM / UNDO ---------- */
function addBetToQueue() {
  if (isDrawing) return;
  const perBet = parseFloat($('bet-val').value);
  if (!perBet || perBet <= 0) return;
  if (selectedBets.size === 0) return;

  const queuedTotal = queuedTransactions.reduce((s, t) => s + t.per * t.bets.length, 0);
  const thisTotal = perBet * selectedBets.size;
  if (queuedTotal + thisTotal > balance) {
    log('ERROR', 'Insufficient balance', 'var(--loss)');
    return;
  }

  queuedTransactions.push({ bets: Array.from(selectedBets), per: perBet });
  log('TICKET', `-$${thisTotal.toFixed(2)} (queued)`, 'var(--accent)');

  selectedBets.clear();
  document.querySelectorAll('.b-opt').forEach(b => b.classList.remove('selected'));
}

function cancelLastTicket() {
  if (isDrawing || queuedTransactions.length === 0) return;
  const t = queuedTransactions.pop();
  const total = t.per * t.bets.length;
  log('CANCEL', `+$${total.toFixed(2)}`, 'var(--loss)');
}

/* ---------- DRAW ---------- */
async function startGame() {
  if (queuedTransactions.length === 0) return;
  isDrawing = true;
  updateUI();

  const sumBall = $('big-ball-object');
  const bigBallText = sumBall.querySelector('b');
  const drawDisplay = $('draw-row');
  const containerRect = $('game-container').getBoundingClientRect();

  drawDisplay.innerHTML = '';
  bigBallText.textContent = '0';
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('hit'));

  let drawn = [];
  let sum = 0;

  for (let i = 0; i < 20; i++) {
    let n;
    do { n = Math.floor(Math.random() * 80) + 1; } while (drawn.includes(n));
    drawn.push(n);
    sum += n;

    const targetCell = $(`cell-${n}`);
    const cellRect = targetCell.getBoundingClientRect();
    sumBall.style.left = (cellRect.left - containerRect.left - 15) + 'px';
    sumBall.style.top  = (cellRect.top  - containerRect.top  - 15) + 'px';

    await new Promise(r => setTimeout(r, 250));

    targetCell.classList.add('hit');
    bigBallText.textContent = sum;

    const b = document.createElement('div');
    b.className = 'draw-ball';
    b.textContent = n;
    drawDisplay.appendChild(b);

    updateLiveHighlights(sum);
  }

  // Return ball home
  sumBall.style.top = '18px';
  sumBall.style.left = '180px';

  await new Promise(r => setTimeout(r, 500));

  /* ---------- SETTLE ---------- */
  const resN = getResRange(sum);
  const resOU = sum <= 810 ? 'U' : 'O';

  let totalBet = 0;
  let totalWin = 0;

  queuedTransactions.forEach(t => {
    t.bets.forEach(bet => {
      totalBet += t.per;

      if (bet === resN) {
        if (bet === '1' || bet === '5') totalWin += t.per * 9.20;
        else if (bet === '2' || bet === '4') totalWin += t.per * 4.60;
        else if (bet === '3') totalWin += t.per * 2.30;
      }

      const binaryRes = sum <= 810 ? 'UNDER' : 'OVER';
      const oeRes = sum % 2 === 0 ? 'EVEN' : 'ODD';
      if (bet === binaryRes || bet === oeRes) totalWin += t.per * 1.95;
    });
  });

  // Secure RPC — server validates balance and updates it atomically
  const { data, error } = await supabase.rpc('place_bet_and_resolve', {
    p_sum: sum,
    p_range: resN || '',
    p_bet_amount: totalBet,
    p_win_amount: totalWin
  });

  if (error) {
    log('ERROR', error.message, 'var(--loss)');
  } else {
    balance = Number(data.balance);
    log(
      'SETTLE',
      `bet $${totalBet.toFixed(2)} | win $${totalWin.toFixed(2)}`,
      totalWin > 0 ? 'var(--win)' : '#8b949e'
    );
  }

  updateHistory('num-hist', 'num', resN || '?', 'dot-n');
  updateHistory('ou-hist',  'ou',  resOU, resOU === 'U' ? 'dot-u' : 'dot-o');

  queuedTransactions = [];
  isDrawing = false;
  updateUI();
}

/* ---------- HELPERS ---------- */
function updateLiveHighlights(sum) {
  document.querySelectorAll('.b-opt').forEach(btn => btn.classList.remove('live-win'));

  const nRange = getResRange(sum);
  if (nRange) $(`btn-${nRange}`).classList.add('live-win');
  $(`btn-${sum % 2 === 0 ? 'EVEN' : 'ODD'}`).classList.add('live-win');
  $(`btn-${sum <= 810 ? 'UNDER' : 'OVER'}`).classList.add('live-win');

  document.querySelectorAll('.rank-card').forEach(c => c.classList.remove('active'));
  if (nRange) $(`card-${nRange}`).classList.add('active');

  const cardU = $('card-U');
  const cardO = $('card-O');
  cardU.classList.remove('active-u');
  cardO.classList.remove('active-o');
  if (sum <= 810) cardU.classList.add('active-u');
  else cardO.classList.add('active-o');
}

function getResRange(s) {
  if (s >= 210 && s <= 695) return '1';
  if (s >= 696 && s <= 763) return '2';
  if (s >= 764 && s <= 855) return '3';
  if (s >= 856 && s <= 923) return '4';
  if (s >= 924 && s <= 1410) return '5';
  return null;
}

function updateHistory(elementId, dataKey, val, cssClass) {
  const data = historyData[dataKey];
  if (data.length > 0 && data[data.length - 1][0] === val) {
    data[data.length - 1].push(val);
  } else {
    data.push([val]);
  }
  if (data.length > MAX_COL) data.shift();

  const container = $(elementId);
  container.innerHTML = '';
  data.forEach(column => {
    const colDiv = document.createElement('div');
    colDiv.className = 'hist-col';
    column.forEach(v => {
      const dot = document.createElement('div');
      dot.className = `hist-dot ${cssClass}`;
      dot.textContent = v;
      colDiv.appendChild(dot);
    });
    container.appendChild(colDiv);
  });
}

function log(title, amount, color) {
  const l = $('trans-log');
  const e = document.createElement('div');
  e.style.color = color;
  e.style.marginBottom = '5px';
  e.style.borderBottom = '1px solid #222';
  e.innerHTML = `<div style="display:flex; justify-content:space-between;"><b>${title}</b><span>${amount}</span></div>`;
  l.prepend(e);
}

function updateUI() {
  $('balance').textContent = `$${balance.toFixed(2)}`;
  $('start-btn').disabled = isDrawing;
}