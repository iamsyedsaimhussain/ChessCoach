import { allReviews, getPuzzleState, getAllBlunderPuzzles } from '../services/storage.js';
import { esc, cap } from '../utils/util.js';
import { parsePgnClocks } from '../engine/clocks.js';
import { renderRatingChartSvg } from '../components/charts.js';
import { Chess } from 'chess.js';

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

export function leaksHtml(S, selectedOpening = null) {
  const games = S.games;
  if (!games.length) return '<div class="card pad muted">Load your games first.</div>';

  const saved = allReviews();
  const pState = getPuzzleState();
  const allBlunders = getAllBlunderPuzzles();
  const unsolvedBlunders = allBlunders.filter((p) => !p.solved).length;

  // ---------- record ----------
  const rec = { win: 0, draw: 0, loss: 0 };
  games.forEach((g) => rec[g.outcome]++);

  // ---------- openings ----------
  const ops = {};
  for (const g of games) {
    const k = g.color + '|' + g.family;
    const o = (ops[k] ||= { family: g.family, color: g.color, win: 0, draw: 0, loss: 0, n: 0 });
    o[g.outcome]++;
    o.n++;
  }
  const opList = Object.values(ops).sort((a, b) => b.n - a.n);

  const opRows = (color) => {
    const rows = opList.filter((o) => o.color === color).slice(0, 6);
    if (!rows.length) return '<div class="muted small pad">No games.</div>';
    return rows
      .map(
        (o) => `<button class="oprow opbtn" data-op-fam="${esc(o.family)}" data-op-col="${o.color}" title="Click to view games and average first mistake">
          <span class="opname">${esc(o.family)}</span>
          <span class="wdl"><i class="w" style="flex:${o.win}"></i><i class="d" style="flex:${o.draw}"></i><i class="l" style="flex:${o.loss}"></i></span>
          <span class="muted opn">${o.n} · ${pct(o.win, o.n)}% ▾</span>
        </button>`
      )
      .join('');
  };

  // ---------- time controls ----------
  const tcs = {};
  for (const g of games) {
    const t = (tcs[g.timeClass] ||= { win: 0, draw: 0, loss: 0, n: 0 });
    t[g.outcome]++;
    t.n++;
  }
  const tcRows = Object.entries(tcs)
    .sort((a, b) => b[1].n - a[1].n)
    .map(
      ([k, t]) => `<div class="oprow"><span class="opname">${cap(k)}</span>
      <span class="wdl"><i class="w" style="flex:${t.win}"></i><i class="d" style="flex:${t.draw}"></i><i class="l" style="flex:${t.loss}"></i></span>
      <span class="muted opn">${t.n} · ${pct(t.win, t.n)}%</span></div>`
    )
    .join('');

  // ---------- engine-based leaks ----------
  const mine = games.filter((g) => saved[g.id] && saved[g.id].summary);
  const phase = { opening: 0, middlegame: 0, endgame: 0 };
  let blundersCount = 0;
  let accSum = 0;
  let slowMistakes = 0;
  let rushedMistakes = 0;
  const bl = [];

  for (const g of mine) {
    const s = saved[g.id].summary;
    for (const k in phase) phase[k] += s.phaseErrors[k] || 0;
    accSum += s.acc[g.color] || 0;
    blundersCount += s.counts[g.color].blunder || 0;
    for (const b of s.blunders.slice(0, 3)) bl.push({ ...b, game: g });

    if (s.slowMistakes != null && s.rushedMistakes != null) {
      slowMistakes += s.slowMistakes;
      rushedMistakes += s.rushedMistakes;
    } else if (g.pgn) {
      try {
        const c = new Chess();
        c.loadPgn(g.pgn);
        const m = c.history({ verbose: true });
        const { hasClocks, spent } = parsePgnClocks(g.pgn, m, g.timeControl);
        if (hasClocks && s.blunders) {
          for (const b of s.blunders) {
            const t = spent[b.ply - 1];
            if (t != null) {
              if (t > 30) slowMistakes++;
              if (t < 3) rushedMistakes++;
            }
          }
        }
      } catch {}
    }
  }

  const totalErr = phase.opening + phase.middlegame + phase.endgame;
  const phaseBars = Object.entries(phase)
    .map(
      ([k, v]) => `<div class="phrow"><span class="phname">${cap(k)}</span>
      <span class="phbar"><i style="width:${pct(v, totalErr)}%"></i></span><span class="muted phn">${v}</span></div>`
    )
    .join('');

  // ---------- games lost on time ----------
  const lossT = games.filter((g) => g.outcome === 'loss' && (g.how === 'timeout' || g.how === 'abandoned')).length;

  // ---------- WEEKLY PLAN V2 (Maximum 3 actionable items) ----------
  const planItems = [];

  // 1. Weakest phase item
  if (mine.length >= 2 && totalErr > 0) {
    const worstPhase = Object.entries(phase).sort((a, b) => b[1] - a[1])[0];
    const tips = {
      opening: 'Most of your errors happen in the first 10 moves.',
      middlegame: 'Tactical oversights in the middlegame cost you the most points.',
      endgame: 'Late-game conversion and piece activity in the endgame needs work.',
    };
    planItems.push({
      title: `Fix your ${worstPhase[0]}`,
      desc: tips[worstPhase[0]],
      btnText: 'Practice now',
      href: `#/puzzles`,
    });
  } else {
    planItems.push({
      title: 'Review your games',
      desc: 'Use the "Review all games" button to unlock full leak analysis.',
      btnText: 'Go to Games',
      href: '#/games',
    });
  }

  // 2. Time trouble or Opening leak item
  const losingOp = opList.filter((o) => o.n >= 3 && o.loss / o.n >= 0.6).sort((a, b) => b.n - a.n)[0];
  if (rushedMistakes >= 3) {
    planItems.push({
      title: 'Eliminate rushed blunders',
      desc: `You made ${rushedMistakes} mistakes under 3s. Slow down before critical moves.`,
      btnText: 'Train tactics',
      href: '#/puzzles',
    });
  } else if (slowMistakes >= 3) {
    planItems.push({
      title: 'Sharpen slow calculations',
      desc: `You spent >30s on ${slowMistakes} moves that still failed. Focus on forcing moves.`,
      btnText: 'Train tactics',
      href: '#/puzzles',
    });
  } else if (lossT >= 2) {
    planItems.push({
      title: 'Watch the clock',
      desc: `${lossT} games were lost on time. Play faster in familiar openings.`,
      btnText: 'Study Openings',
      href: '#/openings',
    });
  } else if (losingOp) {
    planItems.push({
      title: `Study ${esc(losingOp.family)} as ${losingOp.color}`,
      desc: `You lost ${losingOp.loss} of ${losingOp.n} games with this opening.`,
      btnText: 'Inspect games',
      href: `#/openings`,
    });
  }

  // 3. Puzzle & revision item
  if (unsolvedBlunders > 0) {
    planItems.push({
      title: `Solve your game blunders`,
      desc: `You have ${unsolvedBlunders} unresolved blunders from your recent games.`,
      btnText: 'Solve now',
      href: '#/puzzles',
    });
  } else {
    planItems.push({
      title: 'Maintain daily tactical sharpness',
      desc: 'Complete today\'s puzzle batch to keep your tactical radar tuned.',
      btnText: 'Solve puzzles',
      href: '#/puzzles',
    });
  }

  // Limit to maximum 3 items
  const finalPlan = planItems.slice(0, 3);
  const planHtml = finalPlan
    .map(
      (p, i) => `
      <div class="planrow" style="align-items:flex-start;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;gap:10px;flex:1;min-width:0;">
          <span class="plannum">${i + 1}</span>
          <div>
            <div style="font-weight:700;">${p.title}</div>
            <div class="muted small">${p.desc}</div>
          </div>
        </div>
        <a class="btn small" href="${p.href}" style="flex:none;margin-left:10px;">${p.btnText}</a>
      </div>`
    )
    .join('');

  // ---------- THIS WEEK VS LAST WEEK PROGRESS CARD (Item 10) ----------
  const now = Date.now();
  const ONE_WEEK = 7 * 86400 * 1000;
  const thisWeekGames = mine.filter((g) => (g.endTime || 0) * 1000 >= now - ONE_WEEK);
  const lastWeekGames = mine.filter(
    (g) => (g.endTime || 0) * 1000 >= now - 2 * ONE_WEEK && (g.endTime || 0) * 1000 < now - ONE_WEEK
  );

  const avgAcc = (list) => {
    if (!list.length) return null;
    let sum = 0;
    for (const g of list) sum += saved[g.id].summary.acc[g.color] || 0;
    return +(sum / list.length).toFixed(1);
  };

  const blundersPerGame = (list) => {
    if (!list.length) return null;
    let bls = 0;
    for (const g of list) bls += saved[g.id].summary.counts[g.color].blunder || 0;
    return +(bls / list.length).toFixed(1);
  };

  const thisWeekAcc = avgAcc(thisWeekGames);
  const lastWeekAcc = avgAcc(lastWeekGames);
  const thisWeekBl = blundersPerGame(thisWeekGames);
  const lastWeekBl = blundersPerGame(lastWeekGames);

  const solvedDates = pState.solvedDates || [];
  const thisWeekSolved = solvedDates.filter((ts) => ts >= now - ONE_WEEK).length;
  const lastWeekSolved = solvedDates.filter((ts) => ts >= now - 2 * ONE_WEEK && ts < now - ONE_WEEK).length;

  const renderTrend = (cur, prev, invert = false) => {
    if (cur == null || prev == null) return '<span class="muted small">—</span>';
    const diff = +(cur - prev).toFixed(1);
    if (diff === 0) return '<span class="muted small">=</span>';
    const isGood = invert ? diff < 0 : diff > 0;
    const arrow = diff > 0 ? '↑' : '↓';
    return `<span class="${isGood ? 'g' : 'r'}" style="font-weight:700;">${arrow} ${Math.abs(diff)}</span>`;
  };

  const progressCardHtml = `
    <div class="card pad">
      <div class="ctitle">This week vs last week</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);">
          <span>Accuracy</span>
          <div style="display:flex;gap:12px;align-items:center;">
            <b>${thisWeekAcc != null ? thisWeekAcc + '%' : '—'}</b>
            <span class="muted small">vs ${lastWeekAcc != null ? lastWeekAcc + '%' : '—'}</span>
            ${renderTrend(thisWeekAcc, lastWeekAcc)}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);">
          <span>Blunders per game</span>
          <div style="display:flex;gap:12px;align-items:center;">
            <b>${thisWeekBl != null ? thisWeekBl : '—'}</b>
            <span class="muted small">vs ${lastWeekBl != null ? lastWeekBl : '—'}</span>
            ${renderTrend(thisWeekBl, lastWeekBl, true)}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <span>Puzzles solved</span>
          <div style="display:flex;gap:12px;align-items:center;">
            <b>${thisWeekSolved}</b>
            <span class="muted small">vs ${lastWeekSolved}</span>
            ${renderTrend(thisWeekSolved, lastWeekSolved)}
          </div>
        </div>
      </div>
    </div>`;

  // ---------- opening detail modal / card ----------
  let opDetailHtml = '';
  if (selectedOpening) {
    const { family, color } = selectedOpening;
    const opGames = games.filter((g) => g.family === family && g.color === color);
    const opReviewed = opGames.filter((g) => saved[g.id] && saved[g.id].summary);

    const firstMistakeMoves = [];
    for (const g of opReviewed) {
      const s = saved[g.id].summary;
      const myBlunders = (s.blunders || []).filter((b) => !b.color || b.color === color);
      if (myBlunders.length) {
        const firstPly = Math.min(...myBlunders.map((b) => b.ply));
        firstMistakeMoves.push(Math.ceil(firstPly / 2));
      }
    }

    let detailSummary = '';
    if (firstMistakeMoves.length) {
      const avgMove = Math.round(firstMistakeMoves.reduce((x, y) => x + y, 0) / firstMistakeMoves.length);
      detailSummary = `You usually go wrong around move ${avgMove} in the ${esc(family)}.`;
    } else if (opReviewed.length) {
      detailSummary = `No mistakes recorded yet in your reviewed ${esc(family)} games. Solid play!`;
    } else {
      detailSummary = `No reviewed games for ${esc(family)} yet. Review games below to see where mistakes start.`;
    }

    const opGameRows = opGames
      .map((g) => {
        const s = saved[g.id] && saved[g.id].summary;
        const mark = g.outcome === 'win' ? '+' : g.outcome === 'loss' ? '−' : '=';
        return `<button class="grow" data-open="${esc(g.id)}" style="padding:8px 10px;">
          <span class="res ${g.outcome}" style="width:24px;height:24px;font-size:15px">${mark}</span>
          <span class="gmain">
            <b>vs ${esc(g.opp)} <span class="muted">(${g.oppRating})</span></b>
            <span class="muted small">${cap(g.timeClass)} · ${g.opening}</span>
          </span>
          ${s ? `<span class="acc">${s.acc[g.color].toFixed(0)}</span>` : '<span class="muted small">Review</span>'}
        </button>`;
      })
      .join('');

    opDetailHtml = `
      <div class="card pad wide" style="border:1px solid var(--line);background:var(--card2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div class="ctitle" style="margin:0">${esc(family)} as ${cap(color)}</div>
          <button class="btn ghost small" data-op-close>✕ Close</button>
        </div>
        <div style="background:#21201d;padding:10px 14px;border-radius:6px;margin-bottom:12px;border-left:4px solid var(--gold);font-size:14px;">
          ${detailSummary}
        </div>
        <div class="sect">Games with this opening (${opGames.length})</div>
        <div class="glist" style="max-height:260px;overflow-y:auto;border-radius:6px;">
          ${opGameRows}
        </div>
      </div>`;
  }

  const blList = bl
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 6)
    .map((b) => {
      const g = b.game;
      return `<button class="brow" data-open="${esc(g.id)}" data-ply="${b.ply}"><i class="mb" style="background:#fa412d">??</i>
        <span><b>${esc(b.san)}</b>${b.bestSan ? ' · best ' + esc(b.bestSan) : ''}<br><span class="muted small">vs ${esc(g.opp)} · ${cap(b.phase)}</span></span></button>`;
    })
    .join('');

  return `
  <div class="grid2">
    ${opDetailHtml}
    <div class="card pad">
      <div class="ctitle">Your weekly plan</div>
      ${planHtml}
    </div>
    ${progressCardHtml}
    <div class="card pad">
      <div class="ctitle">Last ${games.length} games</div>
      <div class="recrow"><div><b class="g">${rec.win}</b><span>Wins</span></div><div><b>${rec.draw}</b><span>Draws</span></div><div><b class="r">${rec.loss}</b><span>Losses</span></div></div>
      ${mine.length ? `<div class="muted small">Average accuracy (${mine.length} reviewed): <b>${(accSum / mine.length).toFixed(1)}</b></div>` : ''}
    </div>
    <div class="card pad">
      <div class="ctitle">Time Trouble</div>
      <div class="recrow">
        <div><b class="r">${slowMistakes}</b><span>Slow (>30s)</span></div>
        <div><b class="r">${rushedMistakes}</b><span>Rushed (<3s)</span></div>
        <div><b class="r">${lossT}</b><span>Lost on time</span></div>
      </div>
      <div class="muted small" style="margin-top:6px">
        ${mine.length ? 'Counts mistakes or blunders made while slow (>30s) or rushed (<3s).' : 'Review some games to populate your time-trouble leaks.'}
      </div>
    </div>
    <div class="card pad">
      <div class="ctitle">Where you make mistakes</div>
      ${mine.length ? phaseBars : '<div class="muted small">Review some games to see this. It counts your mistakes and blunders by game phase.</div>'}
    </div>
    <div class="card pad">
      <div class="ctitle">Openings as White <span class="muted small" style="font-weight:normal">(tap to inspect)</span></div>
      ${opRows('white')}
    </div>
    <div class="card pad">
      <div class="ctitle">Openings as Black <span class="muted small" style="font-weight:normal">(tap to inspect)</span></div>
      ${opRows('black')}
    </div>
    <div class="card pad">
      <div class="ctitle">Time controls</div>
      ${tcRows}
    </div>
    <div class="card pad wide">
      <div class="ctitle">Rating Trend</div>
      ${renderRatingChartSvg(games)}
    </div>
    ${blList ? `<div class="card pad wide"><div class="ctitle">Your worst moves (tap to replay)</div><div class="blist">${blList}</div></div>` : ''}
  </div>`;
}
