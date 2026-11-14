// Saves finished reviews in the browser so you never re-analyse the same game.
const KEY = 'cc_reviews_v1';
let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}

export const getReview = (id) => load()[id] || null;
export const allReviews = () => load();

export function saveReview(id, data) {
  const c = load();
  c[id] = data;
  let keys = Object.keys(c);
  // Proactively prevent localStorage bloat on mobile/low-memory devices (keep up to 150 reviews)
  if (keys.length > 150) {
    const toDrop = keys.slice(0, keys.length - 150);
    for (const k of toDrop) delete c[k];
    keys = Object.keys(c);
  }
  // If storage full, drop the oldest saved reviews until it fits
  while (!persist() && keys.length > 1) {
    delete c[keys.shift()];
  }
}

export const getUser = () => {
  try {
    return localStorage.getItem('cc_user') || '';
  } catch {
    return '';
  }
};
export const setUser = (u) => {
  try {
    localStorage.setItem('cc_user', u);
  } catch {}
};

// ---------- puzzle history & spaced repetition ----------
const PUZZLE_KEY = 'cc_puzzles_v2';
export function getPuzzleState() {
  try {
    const raw = localStorage.getItem(PUZZLE_KEY);
    if (!raw) return { history: {}, streak: 0, bestStreak: 0, solvedDates: [] };
    const parsed = JSON.parse(raw);
    return {
      history: parsed.history || {},
      streak: parsed.streak || 0,
      bestStreak: parsed.bestStreak || 0,
      solvedDates: parsed.solvedDates || [],
    };
  } catch {
    return { history: {}, streak: 0, bestStreak: 0, solvedDates: [] };
  }
}

export function recordPuzzleAttempt(puzzleId, solved, meta = {}) {
  try {
    const state = getPuzzleState();
    const now = Date.now();
    const curr = state.history[puzzleId] || {
      attempts: 0,
      successes: 0,
      interval: 1, // days until next review
      ease: 2.5,
      repetitions: 0,
      dueDate: now,
    };

    curr.attempts++;
    curr.lastAttempt = now;

    if (solved) {
      curr.successes++;
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      state.solvedDates.push(now);
      // Spaced repetition progression (SuperMemo SM-2 adaptation)
      if (curr.repetitions === 0) curr.interval = 1;
      else if (curr.repetitions === 1) curr.interval = 3;
      else curr.interval = Math.round(curr.interval * curr.ease);
      curr.repetitions++;
      curr.dueDate = now + curr.interval * 86400 * 1000;
      curr.mastered = curr.repetitions >= 4;
    } else {
      state.streak = 0;
      curr.repetitions = 0;
      curr.interval = 1;
      curr.dueDate = now; // retry immediately / today
      curr.mastered = false;
      curr.ease = Math.max(1.3, curr.ease - 0.2);
    }

    if (meta.theme) curr.theme = meta.theme;
    if (meta.rating) curr.rating = meta.rating;
    if (meta.source) curr.source = meta.source;

    state.history[puzzleId] = curr;
    // limit solvedDates history to last 500 entries
    if (state.solvedDates.length > 500) {
      state.solvedDates = state.solvedDates.slice(-500);
    }
    localStorage.setItem(PUZZLE_KEY, JSON.stringify(state));
    return state;
  } catch {
    return getPuzzleState();
  }
}

// ---------- lessons progress ----------
const LESSONS_KEY = 'cc_lessons_v1';
export function getLessonsState() {
  try {
    return JSON.parse(localStorage.getItem(LESSONS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveLessonProgress(id, completed = true, score = 100) {
  try {
    const state = getLessonsState();
    state[id] = { completed, score, timestamp: Date.now() };
    localStorage.setItem(LESSONS_KEY, JSON.stringify(state));
  } catch {}
}

// ---------- opening favorites ----------
const OPENINGS_KEY = 'cc_openings_favs_v1';
export function getFavoriteOpenings() {
  try {
    return JSON.parse(localStorage.getItem(OPENINGS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function toggleFavoriteOpening(fam, col) {
  try {
    let favs = getFavoriteOpenings();
    const key = `${col}|${fam}`;
    if (favs.includes(key)) {
      favs = favs.filter((k) => k !== key);
    } else {
      favs.push(key);
    }
    localStorage.setItem(OPENINGS_KEY, JSON.stringify(favs));
    return favs;
  } catch {
    return [];
  }
}

// ---------- daily session streak ----------
const DAILY_KEY = 'cc_daily_streak_v1';
export function getDailyStreak() {
  try {
    return JSON.parse(localStorage.getItem(DAILY_KEY) || '{"streak":0,"lastDay":"","completedDays":[]}');
  } catch {
    return { streak: 0, lastDay: '', completedDays: [] };
  }
}

export function markDailySessionComplete() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const data = getDailyStreak();
    if (data.lastDay === today) return data;

    const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);
    if (data.lastDay === yesterday) {
      data.streak++;
    } else {
      data.streak = 1;
    }
    data.lastDay = today;
    if (!data.completedDays.includes(today)) {
      data.completedDays.push(today);
    }
    if (data.completedDays.length > 90) data.completedDays.shift();
    localStorage.setItem(DAILY_KEY, JSON.stringify(data));
    return data;
  } catch {
    return { streak: 1, lastDay: '', completedDays: [] };
  }
}

// Extracted from puzzles UI so it can be queried without pulling Chessground into initial bundle
export function getAllBlunderPuzzles() {
  const saved = allReviews();
  const puzzles = [];
  const pState = getPuzzleState();

  for (const [id, rev] of Object.entries(saved)) {
    if (!rev.summary || !rev.summary.blunders) continue;
    const blunders = rev.summary.blunders;
    for (const b of blunders) {
      if (!b.fen || !b.best) continue;
      const pId = `${id}_p${b.ply}`;
      const history = pState.history[pId] || null;
      puzzles.push({
        id: pId,
        gameId: id,
        ply: b.ply,
        fen: b.fen,
        best: b.best,
        bestSan: b.bestSan,
        userSan: b.san,
        loss: b.loss || 0,
        phase: b.phase || 'middlegame',
        color: b.color || (b.fen.split(' ')[1] === 'w' ? 'white' : 'black'),
        opp: rev.family || 'Opponent',
        solved: history && history.successes > 0,
        attempts: history ? history.attempts : 0,
        dueDate: history ? history.dueDate : 0,
        mastered: history ? !!history.mastered : false,
      });
    }
  }

  puzzles.sort((a, b) => {
    if (a.solved !== b.solved) return a.solved ? 1 : -1;
    return b.loss - a.loss;
  });

  return puzzles;
}
