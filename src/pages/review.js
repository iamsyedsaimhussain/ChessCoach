import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import { getEngine, detectDefaultDepth } from '../engine/engine.js';
import { analyseGame, buildReview, summarize, CLASSES, CLASS_ORDER, winPct } from '../engine/analysis.js';
import { getReview, saveReview } from '../services/storage.js';
import { esc, fmtEval, tcLabel, cap } from '../utils/util.js';
import { parsePgnClocks } from '../engine/clocks.js';
import { renderTimeChartSvg } from '../components/charts.js';
import { explainMove } from '../engine/explanations.js';

export function mountReview(main, S) {
  const g = S.current;
  if (!g) {
    location.hash = '#/games';
    return;
  }

  let moves;
  try {
    const c = new Chess();
    c.loadPgn(g.pgn);
    moves = c.history({ verbose: true });
  } catch {
    main.innerHTML = '<div class="card pad">Could not read this game.</div>';
    return;
  }
  const fens = [moves.length ? moves[0].before : new Chess().fen(), ...moves.map((m) => m.after)];
  const token = S.token;
  const $ = (sel) => main.querySelector(sel);

  const { hasClocks, spent } = parsePgnClocks(g.pgn, moves, g.timeControl);

  let ply = Math.min(S.startPly ?? 0, moves.length);
  S.startPly = null;
  let orientation = g.color;
  let evals = [];
  let review = [];
  let summary = null;
  let running = false;
  let progress = 0;
  let err = '';

  const cached = getReview(g.id);
  if (cached) {
    evals = cached.evals.map(([cp, mate, best]) => ({ cp, mate, best }));
    review = buildReview(moves, evals, spent);
    summary = cached.summary || summarize(review, g.color, spent);
  } else {
    review = buildReview(moves, evals, spent);
  }

  main.innerHTML = `
  <div class="review">
    <div class="board-col">
      <div class="pbar" id="pbtop"></div>
      <div class="board-row">
        <div class="evalbar" id="evalbar"><div class="eval-black" id="evalblack"></div><span class="eval-num" id="evalnum"></span></div>
        <div class="board-wrap"><div id="board"></div><div id="badge" class="badge" hidden></div></div>
      </div>
      <div class="pbar" id="pbbottom"></div>
    </div>
    <aside class="rpanel">
      <div class="card">
        <div class="rhead"><span class="rknight">♞</span> Game Review</div>
        <div id="rbody"></div>
      </div>
      <div class="card movecard">
        <div id="moves" class="movelist"></div>
        <div id="timechart" class="timechart"></div>
        <div id="movenote" class="movenote"></div>
        <div class="controls">
          <button class="cbtn" data-act="first" title="Start">⏮</button>
          <button class="cbtn" data-act="prev" title="Back">◀</button>
          <button class="cbtn" data-act="next" title="Forward">▶</button>
          <button class="cbtn" data-act="last" title="End">⏭</button>
          <button class="cbtn" data-act="flip" title="Flip board">⇅</button>
        </div>
      </div>
    </aside>
  </div>`;

  const cg = Chessground($('#board'), {
    fen: fens[ply],
    orientation,
    viewOnly: true,
    coordinates: true,
    coordinatesOnSquares: false,
    animation: { duration: 150 },
    highlight: { lastMove: true, check: true },
  });

  // ---------- drawing helpers ----------
  function renderBars() {
    const me = { name: g.myName, rating: g.myRating, color: g.color };
    const opp = { name: g.opp, rating: g.oppRating, color: g.color === 'white' ? 'black' : 'white' };
    const [top, bottom] = orientation === g.color ? [opp, me] : [me, opp];
    const bar = (p) =>
      `<span class="pdot ${p.color}"></span><b>${esc(p.name)}</b><span class="muted">(${p.rating})</span>`;
    $('#pbtop').innerHTML = bar(top);
    $('#pbbottom').innerHTML = bar(bottom);
    $('#evalbar').classList.toggle('flip', orientation === 'black');
  }

  function updateEvalBar() {
    const e = evals[ply];
    const fill = $('#evalblack');
    const num = $('#evalnum');
    if (!e) {
      fill.style.height = '50%';
      num.textContent = '';
      return;
    }
    fill.style.height = 100 - winPct(e.cp) + '%';
    const whiteAhead = e.cp >= 0;
    const atBottom = whiteAhead !== (orientation === 'black');
    num.className = 'eval-num ' + (atBottom ? 'bottom' : 'top') + (whiteAhead ? ' dark' : ' light');
    num.textContent = fmtEval(e);
  }

  function updateBadge() {
    const b = $('#badge');
    const p = ply > 0 ? review[ply - 1] : null;
    if (!p || p.pending) {
      b.hidden = true;
      return;
    }
    const file = 'abcdefgh'.indexOf(p.to[0]);
    const rank = Number(p.to[1]);
    const col = orientation === 'white' ? file : 7 - file;
    const row = orientation === 'white' ? 8 - rank : rank - 1;
    const c = CLASSES[p.cls];
    b.hidden = false;
    b.style.left = (col + 1) * 12.5 + '%';
    b.style.top = row * 12.5 + '%';
    b.style.background = c.color;
    b.textContent = c.sym;
  }

  function updateNote() {
    const el = $('#movenote');
    if (ply === 0) {
      el.innerHTML = '<span class="muted">Start position</span>';
      return;
    }
    const p = review[ply - 1];
    const ev = fmtEval(evals[ply]);
    const isMyMove = (ply - 1) % 2 === (g.color === 'white' ? 0 : 1);
    let timeStr = '';
    if (hasClocks && spent[ply - 1] != null) {
      const s = spent[ply - 1];
      timeStr = ` · ${isMyMove ? `You spent ${s} s` : `${esc(g.opp)} spent ${s} s`}`;
    }

    if (!p || p.pending) {
      el.innerHTML = `<span><b>${esc(moves[ply - 1].san)}</b><span class="muted small">${timeStr}</span></span>`;
      return;
    }
    const c = CLASSES[p.cls];
    let explainHtml = '';
    const explanation = explainMove(p, moves[ply - 1], evals[ply - 1], evals[ply]);
    if (explanation && ['inaccuracy', 'mistake', 'blunder'].includes(p.cls)) {
      const tagBadges = (explanation.tags || [])
        .map((t) => `<span class="chip" style="font-size:10px;padding:1px 6px;background:rgba(250,65,45,0.2);color:#ff9e94;border:1px solid rgba(250,65,45,0.3);">${esc(t)}</span>`)
        .join(' ');
      explainHtml = `
        <div class="move-breakdown" style="margin-top:8px;padding:8px 10px;background:#211f1c;border-radius:6px;border-left:3px solid ${c.color};font-size:12px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${tagBadges}</div>
          <div style="color:#dcdad6;">${esc(explanation.text)}</div>
          ${explanation.bestSan ? `<div class="muted" style="font-size:11px;">Best alternative: <b style="color:var(--green)">${esc(explanation.bestSan)}</b> · Eval before: ${explanation.evalBefore} → after: ${explanation.evalAfter}</div>` : ''}
        </div>`;
    }

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;width:100%;">
        <i class="mb" style="background:${c.color}">${c.sym}</i>
        <span><b>${esc(p.san)}</b> is ${
          p.cls === 'best' ? 'the best move' : (/^[aeiou]/i.test(c.label) ? 'an ' : 'a ') + c.label.toLowerCase()
        }${p.bestSan ? ` · Best was <b>${esc(p.bestSan)}</b>` : ''}<span class="muted small">${timeStr}</span></span>
        <span class="evtag">${ev}</span>
      </div>
      ${explainHtml}`;
  }

  function updateTimeChart() {
    const tc = $('#timechart');
    if (!tc) return;
    if (hasClocks) {
      tc.innerHTML = renderTimeChartSvg(spent, moves, g.color, ply);
    } else {
      tc.innerHTML = '';
    }
  }

  function gotoPly(n) {
    ply = Math.max(0, Math.min(moves.length, n));
    const fen = fens[ply];
    const turn = fen.split(' ')[1] === 'w' ? 'white' : 'black';
    const last = ply > 0 ? [moves[ply - 1].from, moves[ply - 1].to] : undefined;
    let inCheck = false;
    try {
      inCheck = new Chess(fen).inCheck();
    } catch {}
    cg.set({ fen, turnColor: turn, lastMove: last, check: inCheck ? turn : false });
    const p = ply > 0 ? review[ply - 1] : null;
    const shapes = [];
    if (p && !p.pending && p.best && ['inaccuracy', 'mistake', 'blunder'].includes(p.cls)) {
      shapes.push({ orig: p.best.slice(0, 2), dest: p.best.slice(2, 4), brush: 'green' });
    }
    cg.setAutoShapes(shapes);
    updateEvalBar();
    updateBadge();
    updateNote();
    updateTimeChart();
    markCurrent();
  }

  function moveCell(i) {
    if (i >= moves.length) return '<span class="mv empty"></span>';
    const p = review[i];
    const b = p && !p.pending ? `<i class="mb" style="background:${CLASSES[p.cls].color}">${CLASSES[p.cls].sym}</i>` : '';
    return `<button class="mv${ply === i + 1 ? ' on' : ''}" data-ply="${i + 1}">${esc(moves[i].san)}${b}</button>`;
  }

  function renderMoves() {
    let h = '';
    for (let i = 0; i < moves.length; i += 2) {
      h += `<div class="mrow"><span class="mnum">${i / 2 + 1}</span>${moveCell(i)}${moveCell(i + 1)}</div>`;
    }
    $('#moves').innerHTML = h || '<div class="muted pad">No moves in this game.</div>';
    markCurrent();
  }

  function markCurrent() {
    const box = $('#moves');
    box.querySelectorAll('.mv.on').forEach((e) => e.classList.remove('on'));
    const on = box.querySelector(`.mv[data-ply="${ply}"]`);
    if (on) {
      on.classList.add('on');
      box.scrollTop = on.offsetTop - box.clientHeight / 2;
    }
  }

  function summaryHtml() {
    const s = summary;
    const mine = g.color;
    const nm = (c) => (c === mine ? 'You' : g.opp);
    const accBox = (c) =>
      `<div class="accbox ${c}"><div class="accnum">${s.acc[c].toFixed(1)}</div><div class="acclbl">${esc(nm(c))} · ${cap(c)}</div></div>`;
    const rows = CLASS_ORDER.map((k) => {
      const c = CLASSES[k];
      return `<div class="crow"><span class="clabel"><i class="mb" style="background:${c.color}">${c.sym}</i>${c.label}</span><span class="cnum">${s.counts.white[k]}</span><span class="cnum">${s.counts.black[k]}</span></div>`;
    }).join('');
    const worst = s.blunders.slice(0, 5);
    const list = worst.length
      ? worst
          .map((b) => {
            const c = CLASSES[b.cls];
            const no = Math.ceil(b.ply / 2) + (b.ply % 2 ? '.' : '...');
            return `<button class="brow" data-ply="${b.ply}"><i class="mb" style="background:${c.color}">${c.sym}</i><span><b>${no} ${esc(b.san)}</b>${b.bestSan ? ' · best ' + esc(b.bestSan) : ''}</span><span class="muted">${cap(b.phase)}</span></button>`;
          })
          .join('')
      : '<div class="muted small">No mistakes or blunders from you. Clean game!</div>';
    return `
      <div class="accrow">${accBox('white')}${accBox('black')}</div>
      <div class="ctable"><div class="crow chead"><span></span><span class="cnum">White</span><span class="cnum">Black</span></div>${rows}</div>
      <div class="sect">Your biggest mistakes</div>
      <div class="blist">${list}</div>
      <button class="btn ghost small" data-act="rerun">Re-run review</button>`;
  }

  function setBody() {
    const body = $('#rbody');
    if (err) {
      body.innerHTML = `<div class="errbox">${esc(err)}</div><button class="btn" data-act="start">Try again</button>`;
    } else if (running) {
      const pct = Math.round((progress / fens.length) * 100);
      body.innerHTML = `<div class="prog"><div class="prog-bar"><i id="pfill" style="width:${pct}%"></i></div>
        <div class="prog-text" id="ptext">Checking position ${progress} of ${fens.length}…</div>
        <button class="btn ghost small" data-act="stop">Stop</button></div>`;
    } else if (summary) {
      body.innerHTML = summaryHtml();
    } else {
      const defD = detectDefaultDepth();
      body.innerHTML = `
        <div class="gameinfo">${cap(g.timeClass)} · ${esc(tcLabel(g.timeControl))} · ${esc(g.opening)}</div>
        <label class="depthrow">Speed & Power
          <select id="depth">
            <option value="8"${defD === 8 ? ' selected' : ''}>Fast (depth 8, ~10s) — Low battery / Phone</option>
            <option value="10"${defD === 10 ? ' selected' : ''}>Quick (depth 10, ~20s)</option>
            <option value="12"${defD === 12 ? ' selected' : ''}>Standard (depth 12, ~45s)</option>
            <option value="14"${defD >= 14 ? ' selected' : ''}>Deep (depth 14)</option>
          </select>
        </label>
        <button class="btn big" data-act="start">Start Review</button>
        <div class="muted small tip">Stockfish runs locally. Depth ${defD} auto-selected for your device. Use ◀ ▶ while you wait.</div>`;
    }
  }

  async function startAnalysis() {
    err = '';
    const depth = Number(($('#depth') || {}).value || detectDefaultDepth());
    running = true;
    progress = 0;
    evals = [];
    summary = null;
    review = buildReview(moves, evals, spent);
    setBody();
    renderMoves();
    gotoPly(ply);
    const engine = getEngine();
    try {
      await engine.start();
    } catch (e) {
      running = false;
      err = e.message || 'Engine could not start';
      if (token === S.token) setBody();
      return;
    }
    const out = await analyseGame(
      fens,
      engine,
      depth,
      (i, e, total) => {
        if (token !== S.token || !running) return;
        evals[i] = e;
        progress = i + 1;
        review = buildReview(moves, evals, spent);
        const f = $('#pfill');
        if (f) f.style.width = Math.round((progress / total) * 100) + '%';
        const t = $('#ptext');
        if (t) t.textContent = `Checking position ${progress} of ${total}…`;
        renderMoves();
        gotoPly(ply);
      },
      () => token !== S.token || !running
    );
    if (token !== S.token) return;
    running = false;
    if (!out) {
      evals = [];
      review = buildReview(moves, evals, spent);
      setBody();
      renderMoves();
      gotoPly(ply);
      return;
    }
    review = buildReview(moves, evals, spent);
    summary = summarize(review, g.color, spent);
    saveReview(g.id, {
      depth,
      evals: evals.map((e) => [e.cp, e.mate, e.best]),
      summary,
      color: g.color,
      outcome: g.outcome,
      family: g.family,
      timeClass: g.timeClass,
      timeSpent: spent,
    });
    setBody();
    renderMoves();
    gotoPly(ply);
  }

  // ---------- events ----------
  main.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-ply]');
    if (!t) return;
    if (t.dataset.ply) return gotoPly(Number(t.dataset.ply));
    switch (t.dataset.act) {
      case 'first': return gotoPly(0);
      case 'prev': return gotoPly(ply - 1);
      case 'next': return gotoPly(ply + 1);
      case 'last': return gotoPly(moves.length);
      case 'flip':
        orientation = orientation === 'white' ? 'black' : 'white';
        cg.set({ orientation });
        renderBars();
        updateEvalBar();
        updateBadge();
        return;
      case 'start': return startAnalysis();
      case 'rerun':
        summary = null;
        setBody();
        return;
      case 'stop':
        running = false;
        return;
    }
  };

  const onKey = (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); gotoPly(ply - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); gotoPly(ply + 1); }
    else if (e.key === 'Home') gotoPly(0);
    else if (e.key === 'End') gotoPly(moves.length);
  };
  document.addEventListener('keydown', onKey);
  S.cleanup = () => {
    document.removeEventListener('keydown', onKey);
    cg.destroy();
  };

  renderBars();
  setBody();
  renderMoves();
  gotoPly(ply);
}
