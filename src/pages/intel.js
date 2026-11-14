import { allReviews, getPuzzleState, getDailyStreak, markDailySessionComplete, getAllBlunderPuzzles } from '../services/storage.js';
import { esc, cap } from '../utils/util.js';

export function computeChessIntelligence(games = []) {
  const saved = allReviews();
  const reviewed = games.filter((g) => saved[g.id] && saved[g.id].summary);

  if (reviewed.length < 2) {
    return { hasEnoughData: false, count: reviewed.length };
  }

  // 1. Weakest game phase
  const phaseErrors = { opening: 0, middlegame: 0, endgame: 0 };
  let totalBlunders = 0;
  let totalMistakes = 0;
  let firstMistakePlies = [];

  // 2. White vs Black
  const colorStats = {
    white: { games: 0, win: 0, loss: 0, draw: 0, accSum: 0 },
    black: { games: 0, win: 0, loss: 0, draw: 0, accSum: 0 },
  };

  // 3. Opponent strength
  const oppRatingStats = {
    stronger: { games: 0, win: 0, loss: 0, draw: 0 },
    weaker: { games: 0, win: 0, loss: 0, draw: 0 },
  };

  // 4. Time controls
  const tcErrors = {};

  for (const g of reviewed) {
    const s = saved[g.id].summary;
    const col = g.color;

    // Phase errors
    for (const p in phaseErrors) {
      phaseErrors[p] += s.phaseErrors[p] || 0;
    }

    // Counts
    totalBlunders += s.counts[col].blunder || 0;
    totalMistakes += s.counts[col].mistake || 0;

    // First mistake ply
    const myBlunders = (s.blunders || []).filter((b) => !b.color || b.color === col);
    if (myBlunders.length) {
      const firstPly = Math.min(...myBlunders.map((b) => b.ply));
      firstMistakePlies.push(firstPly);
    }

    // Color performance
    colorStats[col].games++;
    colorStats[col][g.outcome]++;
    colorStats[col].accSum += s.acc[col] || 0;

    // Opponent rating
    if (g.oppRating && g.myRating) {
      const bucket = g.oppRating > g.myRating ? 'stronger' : 'weaker';
      oppRatingStats[bucket].games++;
      oppRatingStats[bucket][g.outcome]++;
    }

    // Time control mistake rate
    tcErrors[g.timeClass] = (tcErrors[g.timeClass] || 0) + (s.counts[col].blunder || 0);
  }

  // Find weakest phase
  const sortedPhases = Object.entries(phaseErrors).sort((a, b) => b[1] - a[1]);
  const weakestPhase = sortedPhases[0];

  // Most problematic time control
  const sortedTcs = Object.entries(tcErrors).sort((a, b) => b[1] - a[1]);
  const worstTc = sortedTcs.length ? sortedTcs[0] : ['blitz', 0];

  // Average move of first mistake
  const avgFirstMistake = firstMistakePlies.length
    ? Math.round(firstMistakePlies.reduce((a, b) => a + b, 0) / firstMistakePlies.length / 2)
    : 12;

  // Construct Top 3 Weaknesses
  const weaknesses = [];

  // Weakness 1: Phase vulnerability
  weaknesses.push({
    name: `${cap(weakestPhase[0])} Vulnerability`,
    stat: `${weakestPhase[1]} errors (${Math.round((weakestPhase[1] / Math.max(1, totalBlunders + totalMistakes)) * 100)}% of mistakes)`,
    affectedGames: reviewed.filter((g) => saved[g.id].summary.phaseErrors[weakestPhase[0]] > 0).length,
    activity: `Train ${weakestPhase[0]} candidate move discipline and defense.`,
    buttonText: `Practice ${cap(weakestPhase[0])}`,
    targetHash: `#/puzzles`,
  });

  // Weakness 2: Early Game or Tactical Hanging Pieces
  if (totalBlunders >= 3) {
    weaknesses.push({
      name: 'Unprovoked Tactical Blunders',
      stat: `Averaging ${(totalBlunders / reviewed.length).toFixed(1)} blunders per game`,
      affectedGames: reviewed.filter((g) => saved[g.id].summary.counts[g.color].blunder > 0).length,
      activity: 'Always perform a two-second safety check before committing your move.',
      buttonText: 'Stop Hanging Pieces',
      targetHash: `#/lessons`,
    });
  } else {
    weaknesses.push({
      name: 'Premature Opening Inaccuracies',
      stat: `First mistake starts around move ${avgFirstMistake}`,
      affectedGames: reviewed.length,
      activity: 'Review your primary opening repertoires and build early piece activity.',
      buttonText: 'Opening Lab',
      targetHash: `#/openings`,
    });
  }

  // Weakness 3: Black repertoire or time control weakness
  const whiteWinRate = colorStats.white.games ? colorStats.white.win / colorStats.white.games : 0.5;
  const blackWinRate = colorStats.black.games ? colorStats.black.win / colorStats.black.games : 0.5;

  if (colorStats.black.games >= 2 && blackWinRate < whiteWinRate - 0.15) {
    weaknesses.push({
      name: 'Vulnerability with Black Pieces',
      stat: `${Math.round(blackWinRate * 100)}% win rate as Black vs ${Math.round(whiteWinRate * 100)}% as White`,
      affectedGames: colorStats.black.games,
      activity: 'Strengthen defensive counter-play and avoid passive setups.',
      buttonText: 'Review Black Repertoire',
      targetHash: `#/openings`,
    });
  } else {
    weaknesses.push({
      name: `${cap(worstTc[0])} Time Management`,
      stat: `${worstTc[1]} blunders in ${cap(worstTc[0])} games`,
      affectedGames: reviewed.filter((g) => g.timeClass === worstTc[0]).length,
      activity: 'Review your mistakes by time control in My Leaks to identify panic points.',
      buttonText: 'Inspect Leaks',
      targetHash: `#/leaks`,
    });
  }

  return {
    hasEnoughData: true,
    count: reviewed.length,
    weakestPhase: weakestPhase[0],
    avgFirstMistake,
    colorStats,
    oppRatingStats,
    weaknesses: weaknesses.slice(0, 3),
  };
}

export function renderDailyTrainingSession() {
  const daily = getDailyStreak();
  const pState = getPuzzleState();
  const allBlunders = getAllBlunderPuzzles();
  const duePuzzles = allBlunders.filter((p) => !p.solved || p.dueDate <= Date.now());

  const tasks = [
    {
      id: 'task_due_puzzles',
      title: 'Daily Tactical Workout',
      desc: duePuzzles.length
        ? `Solve 3 puzzles from your review blunders (${duePuzzles.length} available)`
        : 'Solve 3 tactical exercises to warm up your vision',
      href: '#/puzzles',
      btn: 'Solve Puzzles',
    },
    {
      id: 'task_daily_lesson',
      title: 'Targeted Skill Lesson',
      desc: 'Master the "Stop Hanging Pieces" and piece-safety technique',
      href: '#/lessons',
      btn: 'Study Lesson',
    },
    {
      id: 'task_repertoire',
      title: 'Repertoire Drill',
      desc: 'Inspect your most-played openings and mistake moves in Opening Lab',
      href: '#/openings',
      btn: 'Opening Lab',
    },
  ];

  const taskRows = tasks
    .map(
      (t, idx) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);gap:10px;">
        <div style="display:flex;gap:10px;align-items:center;flex:1;min-width:0;">
          <span class="plannum" style="background:#4da6ff;">${idx + 1}</span>
          <div>
            <b style="font-size:14px;">${t.title}</b>
            <div class="muted small">${t.desc}</div>
          </div>
        </div>
        <a class="btn small ghost" href="${t.href}" style="flex:none;">${t.btn}</a>
      </div>`
    )
    .join('');

  return `
    <div class="card pad" style="background:var(--card2);border:1px solid var(--line);margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div>
          <div class="ctitle" style="margin:0;">📅 Personalized Daily Training Session</div>
          <div class="muted small">3 short, targeted daily activities based on your performance profile.</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="streak-badge" style="background:#211f1c;">⚡ Daily Streak: <b>${daily.streak} days</b></span>
          <button class="btn small" id="btn-complete-daily">✓ Mark Complete</button>
        </div>
      </div>
      <div style="margin-top:6px;">${taskRows}</div>
    </div>`;
}

