import { Chess } from 'chess.js';

export const CLASSES = {
  best: { label: 'Best', sym: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', sym: '!', color: '#96bc4b' },
  good: { label: 'Good', sym: '✓', color: '#8fa06f' },
  inaccuracy: { label: 'Inaccuracy', sym: '?!', color: '#f7c631' },
  mistake: { label: 'Mistake', sym: '?', color: '#ffa459' },
  blunder: { label: 'Blunder', sym: '??', color: '#fa412d' },
};
export const CLASS_ORDER = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];

// cp (from White) -> White's winning chance, 0..100
export const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

export function classify(loss, isBest) {
  if (isBest) return 'best';
  if (loss <= 2) return 'excellent';
  if (loss <= 5) return 'good';
  if (loss <= 10) return 'inaccuracy';
  if (loss <= 20) return 'mistake';
  return 'blunder';
}

const moveAccuracy = (loss) => Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

export function terminalEval(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -10000 : 10000, mate: null, best: null };
  if (c.isStalemate() || c.isInsufficientMaterial() || c.isDraw()) return { cp: 0, mate: null, best: null };
  return null;
}

export async function analyseGame(fens, engine, depth, onStep, aborted) {
  const evals = [];
  // Transposition and position evaluation cache across the game
  const fenCache = new Map();

  for (let i = 0; i < fens.length; i++) {
    if (aborted()) return null;
    const fen = fens[i];

    // 1. Fast check for terminal positions (instant, 0 engine cost)
    const t = terminalEval(fen);
    if (t) {
      evals.push(t);
      onStep(i, t, fens.length);
      continue;
    }

    // 2. Normalize FEN key to leverage transpositions
    const fenKey = fen.split(' ').slice(0, 4).join(' ');
    let e = fenCache.get(fenKey);

    if (!e) {
      e = await engine.analyse(fen, depth);
      fenCache.set(fenKey, e);
    }

    evals.push(e);
    onStep(i, e, fens.length);

    // 3. Non-blocking micro-yield: keeps UI thread, animations, and touch events at 60fps on low-end CPUs
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return evals;
}

function uciToSan(fen, uci) {
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return m.san;
  } catch {
    return uci;
  }
}

export function phaseOf(fen, ply) {
  if (ply <= 20) return 'opening';
  const board = fen.split(' ')[0];
  const val = { n: 3, b: 3, r: 5, q: 9 };
  let total = 0;
  for (const ch of board.toLowerCase()) total += val[ch] || 0;
  return total <= 24 ? 'endgame' : 'middlegame';
}

// moves: chess.js verbose moves. evals: array (length moves+1, may have holes while analysing)
export function buildReview(moves, evals, spent = []) {
  return moves.map((m, i) => {
    const white = m.color === 'w';
    const b = evals[i];
    const a = evals[i + 1];
    const timeSpent = spent && spent[i] != null ? spent[i] : null;
    const base = { ply: i + 1, san: m.san, from: m.from, to: m.to, color: white ? 'white' : 'black', fenBefore: m.before, timeSpent };
    if (!b || !a) return { ...base, pending: true };
    const mb = white ? b.cp : -b.cp;
    const ma = white ? a.cp : -a.cp;
    const loss = Math.max(0, winPct(mb) - winPct(ma));
    const uci = m.from + m.to + (m.promotion || '');
    const isBest = !!b.best && uci === b.best;
    const cls = classify(loss, isBest);
    return {
      ...base,
      loss,
      cls,
      acc: moveAccuracy(loss),
      best: b.best,
      bestSan: b.best && !isBest ? uciToSan(m.before, b.best) : null,
      evalBefore: b,
      evalAfter: a,
      phase: phaseOf(m.before, i + 1),
    };
  });
}

export function summarize(review, myColor, spent = []) {
  const counts = { white: {}, black: {} };
  const accs = { white: [], black: [] };
  for (const c of ['white', 'black']) for (const k of CLASS_ORDER) counts[c][k] = 0;
  const phaseErrors = { opening: 0, middlegame: 0, endgame: 0 };
  const blunders = [];
  let slowMistakes = 0;
  let rushedMistakes = 0;

  for (let i = 0; i < review.length; i++) {
    const p = review[i];
    if (p.pending) continue;
    counts[p.color][p.cls]++;
    accs[p.color].push(p.acc);
    if (p.color === myColor && (p.cls === 'mistake' || p.cls === 'blunder')) {
      phaseErrors[p.phase]++;
      const t = p.timeSpent != null ? p.timeSpent : (spent && spent[i] != null ? spent[i] : null);
      if (t != null) {
        if (t > 30) slowMistakes++;
        if (t < 3) rushedMistakes++;
      }
      blunders.push({
        ply: p.ply,
        san: p.san,
        bestSan: p.bestSan,
        loss: p.loss,
        cls: p.cls,
        phase: p.phase,
        fen: p.fenBefore,
        best: p.best,
        timeSpent: t,
        color: p.color,
      });
    }
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  blunders.sort((x, y) => y.loss - x.loss);
  return { acc: { white: avg(accs.white), black: avg(accs.black) }, counts, phaseErrors, blunders, slowMistakes, rushedMistakes };
}
