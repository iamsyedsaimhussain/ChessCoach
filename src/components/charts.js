import { esc, cap } from '../utils/util.js';

const MODE_COLORS = {
  rapid: '#81b64c',
  blitz: '#f7c631',
  bullet: '#fa412d',
  daily: '#4da6ff',
};

let lastRatingCache = { key: '', html: '' };

export function renderRatingChartSvg(games = []) {
  if (!games || !games.length) {
    return '<div class="muted small pad">No games available for rating trend.</div>';
  }

  const cacheKey = `${games.length}_${games[0]?.id || ''}_${games[0]?.endTime || ''}`;
  if (lastRatingCache.key === cacheKey) return lastRatingCache.html;

  // Sort games oldest to newest
  const sorted = [...games].sort((a, b) => (a.endTime || 0) - (b.endTime || 0));

  // Group ratings by timeClass
  const series = {};
  for (const g of sorted) {
    if (!g.myRating || !g.timeClass) continue;
    const tc = g.timeClass;
    if (!series[tc]) series[tc] = [];
    series[tc].push({
      rating: g.myRating,
      time: g.endTime,
      opp: g.opp,
      outcome: g.outcome,
    });
  }

  const activeClasses = Object.keys(series).filter((k) => series[k].length >= 2);
  if (!activeClasses.length) {
    return '<div class="muted small pad">Need at least 2 games in a time control to show rating trend.</div>';
  }

  // Find min & max across all series
  let minR = Infinity;
  let maxR = -Infinity;
  let maxLen = 0;
  for (const tc of activeClasses) {
    for (const pt of series[tc]) {
      if (pt.rating < minR) minR = pt.rating;
      if (pt.rating > maxR) maxR = pt.rating;
    }
    if (series[tc].length > maxLen) maxLen = series[tc].length;
  }

  if (minR === Infinity) return '';

  const padR = Math.max(25, Math.ceil((maxR - minR) * 0.1));
  const chartMin = Math.floor((minR - padR) / 25) * 25;
  const chartMax = Math.ceil((maxR + padR) / 25) * 25;
  const rangeR = Math.max(50, chartMax - chartMin);

  const W = 520;
  const H = 160;
  const padL = 45;
  const padR_space = 20;
  const padT = 20;
  const padB = 30;
  const plotW = W - padL - padR_space;
  const plotH = H - padT - padB;

  const yVal = (r) => padT + plotH - ((r - chartMin) / rangeR) * plotH;

  // Grid lines
  const steps = 4;
  let gridLines = '';
  for (let i = 0; i <= steps; i++) {
    const val = Math.round(chartMin + (rangeR / steps) * i);
    const y = yVal(val);
    gridLines += `
      <line x1="${padL}" y1="${y}" x2="${W - padR_space}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3"/>
      <text x="${padL - 8}" y="${y + 4}" fill="#8b8987" font-size="10" text-anchor="end" font-weight="600">${val}</text>`;
  }

  // Lines and points per time class
  let paths = '';
  let points = '';
  let legends = '';

  for (const tc of activeClasses) {
    const pts = series[tc];
    const col = MODE_COLORS[tc] || '#81b64c';
    const coords = pts.map((pt, idx) => {
      const x = padL + (pts.length === 1 ? plotW / 2 : (idx / (pts.length - 1)) * plotW);
      const y = yVal(pt.rating);
      return { x, y, pt };
    });

    const polyPoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    paths += `<polyline fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polyPoints}"/>`;

    for (const c of coords) {
      points += `
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${col}" stroke="#262421" stroke-width="1.5">
          <title>${cap(tc)}: ${c.pt.rating} vs ${esc(c.pt.opp)} (${c.pt.outcome})</title>
        </circle>`;
    }

    const latest = pts[pts.length - 1].rating;
    legends += `
      <div class="rate" style="font-size:12px; gap:4px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${col}"></span>
        <span>${cap(tc)}</span>
        <b>${latest}</b>
      </div>`;
  }

  const html = `
    <div class="trend-chart-wrap">
      <div class="trend-legends" style="display:flex;gap:14px;margin-bottom:8px;flex-wrap:wrap;">
        ${legends}
      </div>
      <svg viewBox="0 0 ${W} ${H}" class="trend-svg" style="width:100%;height:auto;display:block;overflow:visible;">
        ${gridLines}
        ${paths}
        ${points}
      </svg>
    </div>`;
  lastRatingCache = { key: cacheKey, html };
  return html;
}

export function renderTimeChartSvg(spent = [], moves = [], myColor = 'white', activePly = 0) {
  if (!spent || !spent.length) return '';

  const total = Math.min(spent.length, moves.length);
  if (total === 0) return '';

  // Calculate maximum time for scaling
  let maxSpent = 0;
  for (let i = 0; i < total; i++) {
    const s = spent[i] || 0;
    if (s > maxSpent) maxSpent = s;
  }
  maxSpent = Math.max(15, Math.min(120, maxSpent));

  const H = 48;
  const barWidth = Math.max(4, Math.min(14, Math.floor(320 / total)));
  const gap = 2;
  const totalW = total * (barWidth + gap);

  let bars = '';
  for (let i = 0; i < total; i++) {
    const s = spent[i] ?? 0;
    const isMine = (i % 2 === 0 && myColor === 'white') || (i % 2 === 1 && myColor === 'black');
    const height = Math.max(3, Math.round((Math.min(s, maxSpent) / maxSpent) * (H - 10)));
    const x = i * (barWidth + gap);
    const y = H - height;
    const isCur = activePly === i + 1;

    let fill = '#484541';
    if (isMine) {
      if (s > 30) fill = '#ffa459'; // slow move
      else if (s < 3) fill = '#8fa06f'; // rushed
      else fill = '#81b64c'; // good pace
    }

    if (isCur) fill = '#fff';

    const san = moves[i] ? moves[i].san : '';
    bars += `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="1" fill="${fill}" data-ply="${i + 1}" style="cursor:pointer;opacity:${isMine ? 1 : 0.45}">
        <title>Move ${Math.ceil((i + 1) / 2)}${i % 2 ? '...' : '.'} ${san}: ${s}s</title>
      </rect>`;
  }

  return `
    <div class="time-chart-container" style="padding:4px 10px 8px;border-top:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span class="muted small" style="font-size:11px;font-weight:700;">Time spent per move</span>
        <span class="muted small" style="font-size:10px;">Max ~${Math.round(maxSpent)}s</span>
      </div>
      <div style="overflow-x:auto;padding-bottom:2px;">
        <svg viewBox="0 0 ${totalW} ${H}" style="height:${H}px;min-width:${Math.min(totalW, 280)}px;display:block;">
          ${bars}
        </svg>
      </div>
    </div>`;
}

