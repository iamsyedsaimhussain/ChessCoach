// Clock parsing and time-per-move calculations from PGN comments
export function parseClockToSeconds(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(parts[0]) || 0;
}

export function parsePgnClocks(pgn, moves = [], timeControl = '') {
  if (!pgn) return { hasClocks: false, spent: [] };

  let baseSec = 0;
  let incSec = 0;
  if (timeControl && !timeControl.includes('/')) {
    const parts = timeControl.split('+');
    baseSec = Number(parts[0]) || 0;
    incSec = Number(parts[1]) || 0;
  }

  const matches = [...pgn.matchAll(/\[%clk\s+([\d:.]+)\]/g)];
  if (!matches.length || matches.length < Math.min(6, Math.floor(moves.length * 0.4))) {
    return { hasClocks: false, spent: [] };
  }

  const rawClocks = matches.map((m) => parseClockToSeconds(m[1]));
  const spent = [];
  let prevW = baseSec > 0 ? baseSec : (rawClocks[0] ?? 0);
  let prevB = baseSec > 0 ? baseSec : (rawClocks[1] ?? rawClocks[0] ?? 0);

  const total = Math.max(moves.length, rawClocks.length);
  for (let i = 0; i < total; i++) {
    if (i >= rawClocks.length) {
      spent.push(null);
      continue;
    }
    const isW = i % 2 === 0;
    const prev = isW ? prevW : prevB;
    const cur = rawClocks[i];
    let s = prev - cur + incSec;
    if (s < 0) s = 0;
    s = +s.toFixed(1);
    spent.push(s);
    if (isW) prevW = cur;
    else prevB = cur;
  }

  return { hasClocks: true, spent };
}

