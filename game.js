// Game UI. All results and balance changes are decided on the server (play_round in Supabase).
(function () {
  const MULT = { 1: 9.2, 2: 4.6, 3: 2.3, 4: 4.6, 5: 9.2, ODD: 1.95, EVEN: 1.95, UNDER: 1.95, OVER: 1.95 };
  const $ = id => document.getElementById(id);
  let choice = null, queue = [], busy = false;

  const css = document.createElement('style');
  css.textContent = `
    #number-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:4px}
    .kn{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 0;text-align:center;font-weight:700}
    .kn.hit{background:#238636;color:#fff;border-color:#2ea043}
    .b-opt.selected{outline:2px solid #58a6ff}
    .rank-card.win,.bin-card.win{outline:3px solid #238636;box-shadow:0 0 12px #238636}
    .ball{display:inline-block;min-width:34px;margin:2px;padding:6px 0;border-radius:50%;background:#58a6ff;color:#000;font-weight:900;text-align:center}
    .hs{display:inline-block;margin:2px;padding:2px 6px;border-radius:4px;background:#21262d;font-size:12px}
    .tl-win{color:#7fffb0}.tl-lose{color:#ffb3b3}.tl-err{color:#ff7b72}`;
  document.head.appendChild(css);

  const money = n => '$' + Number(n).toFixed(2);
  const log = (html) => { $('trans-log').innerHTML = html; };

  function renderQueue() {
    const tot = queue.reduce((a, q) => a + q.stake, 0);
    log(queue.length
      ? queue.map(q => `<div>${q.choice} — ${money(q.stake)} (x${MULT[q.choice].toFixed(2)})</div>`).join('') + `<div><b>Total: ${money(tot)}</b></div>`
      : '<div>No bets yet. Pick an option, set the stake, press CONFIRM.</div>');
  }

  document.querySelectorAll('.b-opt').forEach(btn => btn.addEventListener('click', () => {
    choice = btn.dataset.v;
    document.querySelectorAll('.b-opt').forEach(b => b.classList.toggle('selected', b === btn));
  }));

  window.addBetToQueue = function () {
    if (busy) return;
    const stake = Math.round(parseFloat($('bet-val').value) * 100) / 100;
    if (!choice) return log('<div class="tl-err">Choose an option first.</div>');
    if (!(stake >= 1)) return log('<div class="tl-err">Minimum stake is $1.</div>');
    const tot = queue.reduce((a, q) => a + q.stake, 0) + stake;
    if (currentProfile && tot > currentProfile.balance) return log('<div class="tl-err">Not enough balance.</div>');
    if (queue.length >= 20) return log('<div class="tl-err">Maximum 20 bets per draw.</div>');
    queue.push({ choice, stake });
    renderQueue();
  };

  window.cancelLastTicket = function () { if (!busy) { queue.pop(); renderQueue(); } };

  window.startGame = async function () {
    if (busy) return;
    if (!queue.length) return log('<div class="tl-err">Place at least one bet.</div>');
    busy = true; $('start-btn').disabled = true;
    document.querySelectorAll('.kn').forEach(n => n.classList.remove('hit'));
    document.querySelectorAll('.rank-card,.bin-card').forEach(c => c.classList.remove('win'));
    $('draw-row').innerHTML = ''; $('big-ball-object').querySelector('b').textContent = '0';

    const { data: r, error } = await supabase.rpc('play_round', { p_bets: queue });
    if (error) {
      log(`<div class="tl-err">${error.message}</div>`);
      busy = false; $('start-btn').disabled = false;
      await loadProfile();
      return;
    }

    let sum = 0;
    for (const n of r.numbers) {
      await new Promise(res => setTimeout(res, 180));
      sum += n;
      $('n' + n).classList.add('hit');
      const ball = document.createElement('span'); ball.className = 'ball'; ball.textContent = n;
      $('draw-row').appendChild(ball);
      $('big-ball-object').querySelector('b').textContent = sum;
    }

    $('card-' + r.rank).classList.add('win');
    const side = r.total <= 810 ? 'U' : 'O';
    $('card-' + side).classList.add('win');
    const h1 = document.createElement('span'); h1.className = 'hs'; h1.textContent = r.total + ' (R' + r.rank + ')';
    const h2 = document.createElement('span'); h2.className = 'hs'; h2.textContent = side;
    $('num-hist').prepend(h1); $('ou-hist').prepend(h2);

    currentProfile.balance = r.balance; renderProfile();
    const net = r.payout - r.stake;
    log(`<div class="${net >= 0 ? 'tl-win' : 'tl-lose'}">Sum ${r.total} — Rank ${r.rank} — Stake ${money(r.stake)}, Won ${money(r.payout)}</div>`);
    queue = []; busy = false; $('start-btn').disabled = false;
  };

  (async function init() {
    const grid = $('number-grid');
    for (let i = 1; i <= 80; i++) {
      const d = document.createElement('div'); d.className = 'kn'; d.id = 'n' + i; d.textContent = i; grid.appendChild(d);
    }
    await loadProfile();
    renderQueue();
  })();
})();
