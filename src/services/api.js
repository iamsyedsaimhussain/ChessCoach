// Chess.com free Public API (read-only, no login, no password).
const BASE = 'https://api.chess.com/pub';
const apiCache = new Map();

async function get(path) {
  const hit = apiCache.get(path);
  if (hit && Date.now() - hit.ts < 300000) {
    return hit.data;
  }
  const r = await fetch(BASE + path);
  if (r.status === 404) throw new Error('NOT_FOUND');
  if (r.status === 429) throw new Error('RATE_LIMIT');
  if (!r.ok) throw new Error('HTTP_' + r.status);
  const data = await r.json();
  apiCache.set(path, { data, ts: Date.now() });
  return data;
}

export const getProfile = (u) => get(`/player/${encodeURIComponent(u)}`);
export const getStats = (u) => get(`/player/${encodeURIComponent(u)}/stats`);

export async function getRecentGames(u, want = 40) {
  const { archives } = await get(`/player/${encodeURIComponent(u)}/games/archives`);
  const out = [];
  for (let i = archives.length - 1; i >= 0 && out.length < want; i--) {
    const data = await get(archives[i].replace(BASE, ''));
    const list = (data.games || []).filter((g) => g.pgn && g.rules === 'chess').reverse();
    out.push(...list);
  }
  return out.slice(0, want).map((g) => normalizeGame(g, u));
}

const DRAWS = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];
const FAMILY_END = ['Defense', 'Game', 'Opening', 'Gambit', 'Attack', 'System', 'Countergambit'];

export function openingOf(pgn) {
  const m = pgn.match(/\[ECOUrl "([^"]+)"\]/);
  if (!m) return { name: 'Unknown opening', family: 'Unknown opening' };
  const parts = m[1].split('/').pop().split('-');
  const words = [];
  for (const p of parts) {
    if (/^\d+\.{1,3}/.test(p)) break;
    words.push(p);
  }
  const name = words.join(' ') || 'Unknown opening';
  let fam = [];
  for (const w of words) {
    fam.push(w);
    if (FAMILY_END.includes(w)) break;
  }
  if (fam.length === words.length && words.length > 3) fam = words.slice(0, 3);
  return { name, family: fam.join(' ') || name };
}

export function normalizeGame(g, username) {
  const me = username.toLowerCase();
  const isWhite = g.white.username.toLowerCase() === me;
  const mine = isWhite ? g.white : g.black;
  const opp = isWhite ? g.black : g.white;
  const outcome = mine.result === 'win' ? 'win' : DRAWS.includes(mine.result) ? 'draw' : 'loss';
  const op = openingOf(g.pgn);
  return {
    id: g.uuid || g.url,
    url: g.url,
    pgn: g.pgn,
    color: isWhite ? 'white' : 'black',
    myName: mine.username,
    myRating: mine.rating,
    opp: opp.username,
    oppRating: opp.rating,
    outcome,
    how: mine.result === 'win' ? opp.result : mine.result,
    timeClass: g.time_class,
    timeControl: g.time_control,
    endTime: g.end_time,
    opening: op.name,
    family: op.family,
  };
}
