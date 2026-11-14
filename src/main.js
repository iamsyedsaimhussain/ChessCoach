import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles/style.css';
import { Chess } from 'chess.js';
import { S } from './services/state.js';
import { getProfile, getStats, getRecentGames } from './services/api.js';
import { mountReview } from './pages/review.js';
import { leaksHtml } from './pages/leaks.js';
// Heavy pages are lazy-loaded on first visit so the initial JS parse is smaller.
// Each function returns the mount function only when the page is actually opened.
const lazyPuzzles  = () => import('./pages/puzzles.js').then((m) => m.mountPuzzles);
const lazyLessons  = () => import('./pages/lessons.js').then((m) => m.mountLessons);
const lazyOpenings = () => import('./pages/openings.js').then((m) => m.mountOpenings);
const lazyProgress = () => import('./pages/progress.js').then((m) => m.mountProgress);
import { computeChessIntelligence, renderDailyTrainingSession } from './pages/intel.js';
import { getUser, setUser, allReviews, saveReview, markDailySessionComplete } from './services/storage.js';
import { esc, ago, tcLabel, cap } from './utils/util.js';
import { renderRatingChartSvg } from './components/charts.js';
import { getEngine, detectDefaultDepth } from './engine/engine.js';
import { analyseGame, buildReview, summarize } from './engine/analysis.js';
import { parsePgnClocks } from './engine/clocks.js';

const app = document.getElementById('app');
const LOGO = '<span class="logo-ico">♞</span><span class="logo-txt">ChessCoach</span>';

export const DEFAULT_DEPTH = detectDefaultDepth();

let batchState = {
  running: false,
  cancel: false,
  total: 0,
  current: 0,
  subPct: 0,
  status: '',
};

let selectedOpening = null;

function shell(active) {
  const nav = [
    ['#/', '🏠', 'Home'],
    ['#/games', '♟', 'Games'],
    ['#/leaks', '📊', 'My Leaks'],
    ['#/puzzles', '🧩', 'Puzzles'],
    ['#/lessons', '🎓', 'Lessons'],
    ['#/openings', '📖', 'Opening Lab'],
    ['#/progress', '📈', 'Progress'],
  ];
  const items = nav
    .map(([h, i, t]) => `<a class="nav${active === h ? ' on' : ''}" href="${h}"><span class="ni">${i}</span><span class="nt">${t}</span></a>`)
    .join('');
  app.innerHTML = `
    <div class="layout">
      <aside class="side">
        <a class="logo" href="#/">${LOGO}</a>
        <nav class="navs">${items}</nav>
        <div class="side-foot">${
          S.user
            ? `<div class="who"><b>${esc(S.user)}</b><a href="#/" data-logout>Switch user</a></div>`
            : '<div class="muted small">Not signed in</div>'
        }</div>
      </aside>
      <main class="main" id="main"></main>
    </div>`;
  return document.getElementById('main');
}

const profileCard = () => {
  const p = S.profile;
  if (!p) return '';
  const st = S.stats || {};
  const modes = [
    ['chess_rapid', 'Rapid', '⏱'],
    ['chess_blitz', 'Blitz', '⚡'],
    ['chess_bullet', 'Bullet', '🔫'],
    ['chess_daily', 'Daily', '☀'],
  ]
    .filter(([k]) => st[k] && st[k].last)
    .map(
      ([k, n, ic]) =>
        `<div class="rate"><span class="ri">${ic}</span><span>${n}</span><b>${st[k].last.rating}</b></div>`
    )
    .join('');
  return `<div class="card pad prof">
    ${p.avatar ? `<img class="avatar" src="${esc(p.avatar)}" alt="" loading="lazy" decoding="async" />` : '<div class="avatar ph">♞</div>'}
    <div><div class="pname">${esc(p.username)}</div><div class="muted small">${p.name ? esc(p.name) : ''}</div></div>
    <div class="rates">${modes || '<span class="muted small">No ratings yet</span>'}</div>
  </div>`;
};

// ---------------- pages ----------------
function pageHome() {
  const main = shell('#/');
  const hasGames = S.games.length > 0;
  const dailySection = hasGames ? renderDailyTrainingSession() : '';
  const ratingSection = S.games.length
    ? `<div class="card pad">
        <div class="ctitle">Rating Trend</div>
        ${renderRatingChartSvg(S.games)}
      </div>`
    : '';

  main.innerHTML = `
    <div class="hero card pad">
      <div class="hero-ico">♞</div>
      <h1>Your personal chess coach</h1>
      <p class="muted">Enter your Chess.com username. We read your public games and find the habits that cost you points.</p>
      <form id="login" class="loginform">
        <input id="uname" type="text" placeholder="Chess.com username" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.user)}" />
        <button class="btn big" type="submit">${S.loading ? 'Loading…' : 'Play'}</button>
      </form>
      ${S.error ? `<div class="errbox">${esc(S.error)}</div>` : ''}
      <div class="muted small">No password needed. Only public data is used.</div>
    </div>
    ${S.profile ? profileCard() : ''}
    ${dailySection}
    ${ratingSection}`;

  document.getElementById('login').onsubmit = (e) => {
    e.preventDefault();
    const u = document.getElementById('uname').value.trim();
    if (u) loadUser(u);
  };

  main.onclick = (e) => {
    if (e.target.closest('#btn-complete-daily')) {
      markDailySessionComplete();
      pageHome();
    }
  };
}

async function loadUser(u) {
  S.loading = true;
  S.error = '';
  S.user = u;
  render();
  try {
    const [profile, stats] = await Promise.all([getProfile(u), getStats(u).catch(() => null)]);
    S.profile = profile;
    S.stats = stats;
    S.games = await getRecentGames(profile.username, 40);
    S.user = profile.username;
    setUser(S.user);
    S.loading = false;
    location.hash = '#/games';
    render();
  } catch (e) {
    S.loading = false;
    S.profile = null;
    S.games = [];
    S.error =
      e.message === 'NOT_FOUND'
        ? `No Chess.com player called "${u}". Check the spelling.`
        : e.message === 'RATE_LIMIT'
        ? 'Chess.com says too many requests. Wait a minute and try again.'
        : 'Could not reach Chess.com. Check your internet and try again.';
    render();
  }
}

async function startBatchReview() {
  if (batchState.running) return;
  const saved = allReviews();
  const unreviewed = S.games.filter((g) => !saved[g.id] || !saved[g.id].summary);
  if (!unreviewed.length) {
    alert('All loaded games are already reviewed!');
    return;
  }

  const depth = DEFAULT_DEPTH;
  batchState = {
    running: true,
    cancel: false,
    total: unreviewed.length,
    current: 0,
    subPct: 0,
    status: `Reviewing 1 of ${unreviewed.length} (depth ${depth})…`,
  };
  const token = S.token;
  pageGames();

  const engine = getEngine();
  try {
    await engine.start();
  } catch (err) {
    batchState.running = false;
    alert('Engine failed to start: ' + (err.message || err));
    pageGames();
    return;
  }

  for (let i = 0; i < unreviewed.length; i++) {
    if (batchState.cancel || S.token !== token) break;
    const g = unreviewed[i];
    batchState.current = i + 1;
    batchState.status = `Reviewing game ${i + 1} of ${unreviewed.length} (depth ${depth}): vs ${esc(g.opp)}…`;
    updateBatchUI();

    try {
      const c = new Chess();
      c.loadPgn(g.pgn);
      const moves = c.history({ verbose: true });
      const fens = [moves.length ? moves[0].before : new Chess().fen(), ...moves.map((m) => m.after)];
      const { spent } = parsePgnClocks(g.pgn, moves, g.timeControl);

      const evals = await analyseGame(
        fens,
        engine,
        depth,
        (plyIdx, e, tot) => {
          if (batchState.cancel || S.token !== token) return;
          batchState.subPct = Math.round(((i + (plyIdx + 1) / tot) / unreviewed.length) * 100);
          updateBatchUI();
        },
        () => batchState.cancel || S.token !== token
      );

      if (batchState.cancel || S.token !== token) break;
      if (evals) {
        const review = buildReview(moves, evals, spent);
        const summary = summarize(review, g.color, spent);
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
      }
    } catch (err) {
      console.warn('Game review error:', g.id, err);
    }
  }

  batchState.running = false;
  if (S.token === token) pageGames();
}

function updateBatchUI() {
  const txt = document.getElementById('batch-txt');
  const fill = document.getElementById('batch-fill');
  if (txt) txt.textContent = batchState.status;
  if (fill) fill.style.width = batchState.subPct + '%';
}

function pageGames() {
  const main = shell('#/games');
  if (!S.user) {
    main.innerHTML = '<div class="card pad">Enter your username on <a href="#/">Home</a> first.</div>';
    return;
  }
  const saved = allReviews();
  const f = S.filter;
  const list = S.games.filter((g) => f === 'all' || g.timeClass === f);

  const classes = ['all', ...new Set(S.games.map((g) => g.timeClass))];
  const chips = classes
    .map(
      (c) =>
        `<button class="chip${f === c ? ' on' : ''}" data-f="${c}">${
          c === 'all' ? 'All' : cap(c)
        }</button>`
    )
    .join('');

  const unreviewedCount = S.games.filter((g) => !saved[g.id] || !saved[g.id].summary).length;

  const batchCard = batchState.running
    ? `<div class="card pad" style="margin-bottom:12px;border:1px solid var(--green);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <b id="batch-txt">${batchState.status}</b>
          <button class="btn ghost small" id="batch-stop">Stop</button>
        </div>
        <div class="prog-bar"><i id="batch-fill" style="width:${batchState.subPct}%"></i></div>
      </div>`
    : '';

  const rows = list
    .map((g) => {
      const s = saved[g.id] && saved[g.id].summary;
      const mark = g.outcome === 'win' ? '+' : g.outcome === 'loss' ? '−' : '=';
      return `<button class="grow" data-id="${esc(g.id)}">
        <span class="res ${g.outcome}">${mark}</span>
        <span class="gmain"><b>${esc(g.myName)} <span class="muted">(${g.myRating})</span> vs ${esc(g.opp)} <span class="muted">(${g.oppRating})</span></b>
          <span class="muted small">${cap(g.timeClass)} · ${esc(tcLabel(g.timeControl))} · ${esc(g.family)} · ${ago(g.endTime)}</span></span>
        ${s ? `<span class="acc">${s.acc[g.color].toFixed(0)}</span>` : '<span class="muted small">Review</span>'}
      </button>`;
    })
    .join('');

  main.innerHTML = `
    ${profileCard()}
    ${batchCard}
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;justify-content:space-between;flex-wrap:wrap;">
      <div class="chips" style="margin:0;">${chips}</div>
      ${
        unreviewedCount > 0 && !batchState.running
          ? `<button class="btn ghost small" id="batch-start">⚡ Review all games (${unreviewedCount})</button>`
          : ''
      }
    </div>
    <div class="card glist">${rows || '<div class="pad muted">No games found.</div>'}</div>`;

  main.onclick = (e) => {
    if (e.target.closest('#batch-start')) {
      return startBatchReview();
    }
    if (e.target.closest('#batch-stop')) {
      batchState.cancel = true;
      batchState.running = false;
      return pageGames();
    }
    const c = e.target.closest('[data-f]');
    if (c) {
      S.filter = c.dataset.f;
      return pageGames();
    }
    const r = e.target.closest('[data-id]');
    if (r) openGame(r.dataset.id);
  };
}

function openGame(id, ply) {
  S.current = S.games.find((g) => g.id === id);
  S.startPly = ply ?? null;
  location.hash = '#/review';
}

function pageReview() {
  const main = shell('#/games');
  mountReview(main, S);
}

function pageLeaks() {
  const main = shell('#/leaks');
  if (!S.user) {
    main.innerHTML = '<div class="card pad">Enter your username on <a href="#/">Home</a> first.</div>';
    return;
  }

  const intel = computeChessIntelligence(S.games);
  let weaknessCard = '';
  if (intel.hasEnoughData) {
    const wRows = intel.weaknesses
      .map(
        (w) => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);gap:10px;">
          <div>
            <b style="color:var(--red);font-size:14px;">${esc(w.name)}</b>
            <div class="muted small" style="margin:2px 0;">${esc(w.stat)} (${w.affectedGames} affected games)</div>
            <div style="font-size:12px;color:#dcdad6;">${esc(w.activity)}</div>
          </div>
          <a class="btn small" href="${w.targetHash}" style="flex:none;">${w.buttonText}</a>
        </div>`
      )
      .join('');

    weaknessCard = `
      <div class="card pad wide" style="background:#211f1c;border-left:4px solid var(--red);margin-bottom:14px;">
        <div class="ctitle" style="margin-bottom:6px;color:#ff9e94;">🎯 Top 3 Weaknesses & Intelligence Insights</div>
        <div class="muted small" style="margin-bottom:10px;">Identified from deep analysis across ${intel.count} reviewed games:</div>
        ${wRows}
      </div>`;
  }

  main.innerHTML = `<h2 class="ptitle">My Leaks</h2>${weaknessCard}${leaksHtml(S, selectedOpening)}`;
  main.onclick = (e) => {
    const cl = e.target.closest('[data-op-close]');
    if (cl) {
      selectedOpening = null;
      return pageLeaks();
    }
    const op = e.target.closest('[data-op-fam]');
    if (op) {
      selectedOpening = { family: op.dataset.opFam, color: op.dataset.opCol };
      return pageLeaks();
    }
    const r = e.target.closest('[data-open]');
    if (r) openGame(r.dataset.open, Number(r.dataset.ply));
  };
}

async function pagePuzzles() {
  const main = shell('#/puzzles');
  const mount = await lazyPuzzles();
  mount(main, S);
}

async function pageLessons() {
  const main = shell('#/lessons');
  const mount = await lazyLessons();
  mount(main, S);
}

async function pageOpenings() {
  const main = shell('#/openings');
  const mount = await lazyOpenings();
  mount(main, S);
}

async function pageProgress() {
  const main = shell('#/progress');
  const mount = await lazyProgress();
  mount(main, S);
}

// ---------------- router ----------------
function render() {
  S.token++;
  if (S.cleanup) {
    S.cleanup();
    S.cleanup = null;
  }
  const h = location.hash || '#/';
  if (h === '#/games') pageGames();
  else if (h === '#/review') pageReview();
  else if (h === '#/leaks') pageLeaks();
  else if (h === '#/puzzles') pagePuzzles();
  else if (h === '#/lessons') pageLessons();
  else if (h === '#/openings') pageOpenings();
  else if (h === '#/progress') pageProgress();
  else pageHome();
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-logout]')) {
    S.user = '';
    S.profile = null;
    S.games = [];
    selectedOpening = null;
    setUser('');
  }
});
window.addEventListener('hashchange', render);

// auto sign-in with the last username
S.user = getUser();
render();
if (S.user && !S.profile) {
  const u = S.user;
  loadUser(u).then(() => {
    if ((location.hash || '#/') === '#/games' || S.error) render();
  });
}
