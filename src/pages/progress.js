import { allReviews, getPuzzleState, getLessonsState, getDailyStreak } from '../services/storage.js';
import { renderRatingChartSvg } from '../components/charts.js';
import { esc, cap } from '../utils/util.js';

let activeRange = '30d'; // '7d' | '30d' | 'all'

function renderAccuracyProgressionSvg(reviewedGames = []) {
  if (reviewedGames.length < 2) {
    return '<div class="muted small pad">Need at least 2 reviewed games to plot accuracy trend.</div>';
  }

  const sorted = [...reviewedGames].sort((a, b) => (a.endTime || 0) - (b.endTime || 0));
  const saved = allReviews();

  const points = sorted.map((g, i) => {
    const acc = saved[g.id] && saved[g.id].summary ? saved[g.id].summary.acc[g.color] : 75;
    return { acc, i, opp: g.opp };
  });

  const W = 520;
  const H = 140;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 25;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const yVal = (acc) => padT + plotH - ((acc - 40) / 60) * plotH;

  let poly = '';
  let dots = '';
  points.forEach((pt, idx) => {
    const x = padL + (idx / (points.length - 1)) * plotW;
    const y = yVal(pt.acc);
    poly += `${x.toFixed(1)},${y.toFixed(1)} `;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--green)" stroke="#262421" stroke-width="1.5"><title>${pt.acc.toFixed(0)}% vs ${esc(pt.opp)}</title></circle>`;
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
      <line x1="${padL}" y1="${yVal(100)}" x2="${W - padR}" y2="${yVal(100)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3"/>
      <text x="${padL - 8}" y="${yVal(100) + 4}" fill="#8b8987" font-size="10" text-anchor="end">100%</text>
      <line x1="${padL}" y1="${yVal(70)}" x2="${W - padR}" y2="${yVal(70)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3"/>
      <text x="${padL - 8}" y="${yVal(70) + 4}" fill="#8b8987" font-size="10" text-anchor="end">70%</text>
      <polyline fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${poly.trim()}"/>
      ${dots}
    </svg>`;
}

export function mountProgress(main, S) {
  const $ = (sel) => main.querySelector(sel);
  const saved = allReviews();
  const pState = getPuzzleState();
  const lState = getLessonsState();
  const daily = getDailyStreak();
  const allGames = S.games;

  function render() {
    const now = Date.now();
    const cutoff =
      activeRange === '7d'
        ? now - 7 * 86400 * 1000
        : activeRange === '30d'
        ? now - 30 * 86400 * 1000
        : 0;

    const filteredGames = allGames.filter((g) => (g.endTime || 0) * 1000 >= cutoff);
    const reviewed = filteredGames.filter((g) => saved[g.id] && saved[g.id].summary);

    let totalAcc = 0;
    let totalBlunders = 0;
    let totalMistakes = 0;

    for (const g of reviewed) {
      const s = saved[g.id].summary;
      const col = g.color;
      totalAcc += s.acc[col] || 0;
      totalBlunders += s.counts[col].blunder || 0;
      totalMistakes += s.counts[col].mistake || 0;
    }

    const avgAcc = reviewed.length ? (totalAcc / reviewed.length).toFixed(1) : '—';
    const blPerGame = reviewed.length ? (totalBlunders / reviewed.length).toFixed(1) : '—';
    const misPerGame = reviewed.length ? (totalMistakes / reviewed.length).toFixed(1) : '—';

    // Puzzle stats
    const puzzleHistory = Object.values(pState.history || {});
    const totalAttempts = puzzleHistory.reduce((a, b) => a + (b.attempts || 0), 0);
    const totalSuccesses = puzzleHistory.reduce((a, b) => a + (b.successes || 0), 0);
    const puzzleSuccessRate = totalAttempts ? Math.round((totalSuccesses / totalAttempts) * 100) : 0;
    const completedLessonsCount = Object.values(lState).filter((s) => s.completed).length;

    main.innerHTML = `
    <div class="progress-page">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 class="ptitle" style="margin:0">Progress & Improvement Dashboard</h2>
          <div class="muted small">Track your rating gains, blunder reduction, and training milestones over time.</div>
        </div>
        <div class="chips" style="margin:0;">
          <button class="chip${activeRange === '7d' ? ' on' : ''}" data-range="7d">Last 7 Days</button>
          <button class="chip${activeRange === '30d' ? ' on' : ''}" data-range="30d">Last 30 Days</button>
          <button class="chip${activeRange === 'all' ? ' on' : ''}" data-range="all">Lifetime</button>
        </div>
      </div>

      <!-- High-level Metric Cards -->
      <div class="grid2" style="margin-bottom:14px;">
        <div class="card pad">
          <div class="ctitle">Accuracy & Precision</div>
          <div class="recrow">
            <div><b class="g">${avgAcc}${avgAcc !== '—' ? '%' : ''}</b><span>Avg Accuracy</span></div>
            <div><b class="r">${blPerGame}</b><span>Blunders/game</span></div>
            <div><b style="color:var(--gold);">${misPerGame}</b><span>Mistakes/game</span></div>
          </div>
          <div class="muted small">${reviewed.length} games analyzed in this period.</div>
        </div>

        <div class="card pad">
          <div class="ctitle">Practice & Training Mastery</div>
          <div class="recrow">
            <div><b class="g">${pState.streak}</b><span>Puzzle Streak</span></div>
            <div><b style="color:#4da6ff;">${puzzleSuccessRate}%</b><span>Success Rate</span></div>
            <div><b class="g">${completedLessonsCount}</b><span>Lessons Done</span></div>
          </div>
          <div class="muted small">⚡ Daily Training Streak: <b>${daily.streak} days</b></div>
        </div>
      </div>

      <!-- Charts Section -->
      <div class="card pad" style="margin-bottom:14px;">
        <div class="ctitle">Rating Progression</div>
        ${renderRatingChartSvg(filteredGames)}
      </div>

      <div class="card pad" style="margin-bottom:14px;">
        <div class="ctitle">Move Accuracy Progression (%)</div>
        ${renderAccuracyProgressionSvg(reviewed)}
      </div>

      <!-- Training Completion Milestone History -->
      <div class="card pad">
        <div class="ctitle">Milestone History</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);">
            <span>Games Imported & Played</span>
            <b>${filteredGames.length} games</b>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);">
            <span>Stockfish Deep Reviews Generated</span>
            <b>${reviewed.length} reviews</b>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);">
            <span>Tactical Puzzles Attempted</span>
            <b>${totalAttempts} attempts (${totalSuccesses} solved)</b>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;">
            <span>Interactive Lessons Completed</span>
            <b>${completedLessonsCount} completed</b>
          </div>
        </div>
      </div>
    </div>`;
  }

  main.onclick = (e) => {
    const rangeBtn = e.target.closest('[data-range]');
    if (rangeBtn) {
      activeRange = rangeBtn.dataset.range;
      render();
    }
  };

  render();
}

