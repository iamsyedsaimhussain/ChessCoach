import { allReviews, getFavoriteOpenings, toggleFavoriteOpening } from '../services/storage.js';
import { esc, cap, ago } from '../utils/util.js';
import { Chess } from 'chess.js';

let activeColor = 'white'; // 'white' | 'black'
let filterSearch = '';
let filterTc = 'all';
let selectedOpening = null;

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

export function buildOpeningRepertoire(games = []) {
  const saved = allReviews();
  const repertoires = { white: {}, black: {} };

  for (const g of games) {
    if (!g.family) continue;
    const col = g.color === 'white' ? 'white' : 'black';
    const rep = repertoires[col];
    const fam = g.family;

    if (!rep[fam]) {
      rep[fam] = {
        family: fam,
        color: col,
        games: [],
        win: 0,
        draw: 0,
        loss: 0,
        accSum: 0,
        reviewedCount: 0,
        mistakesCount: 0,
        firstMistakePlies: [],
        variations: {},
      };
    }

    const o = rep[fam];
    o.games.push(g);
    o[g.outcome]++;

    // Variations extraction from PGN
    try {
      const c = new Chess();
      c.loadPgn(g.pgn);
      const moves = c.history();
      if (moves.length >= 4) {
        const line = moves.slice(0, Math.min(8, moves.length)).join(' ');
        o.variations[line] = (o.variations[line] || 0) + 1;
      }
    } catch {}

    const rev = saved[g.id];
    if (rev && rev.summary) {
      o.reviewedCount++;
      o.accSum += rev.summary.acc[col] || 0;
      const blunders = rev.summary.blunders || [];
      if (blunders.length) {
        o.mistakesCount += blunders.length;
        const firstPly = Math.min(...blunders.map((b) => b.ply));
        o.firstMistakePlies.push(firstPly);
      }
    }
  }

  return repertoires;
}

export function mountOpenings(main, S) {
  const $ = (sel) => main.querySelector(sel);
  const rep = buildOpeningRepertoire(S.games);
  const favs = getFavoriteOpenings();

  function render() {
    const list = Object.values(rep[activeColor] || {});
    const filtered = list.filter((o) => {
      if (filterSearch && !o.family.toLowerCase().includes(filterSearch.toLowerCase())) return false;
      if (filterTc !== 'all' && !o.games.some((g) => g.timeClass === filterTc)) return false;
      return true;
    });

    // Sort by games played
    filtered.sort((a, b) => b.games.length - a.games.length);

    // Identify best and weakest openings
    const withAtLeast2 = list.filter((o) => o.games.length >= 2);
    const mostSuccessful = [...withAtLeast2].sort((a, b) => b.win / b.games.length - a.win / a.games.length)[0] || null;
    const highestMistakes = [...withAtLeast2].sort((a, b) => (b.mistakesCount / Math.max(1, b.reviewedCount)) - (a.mistakesCount / Math.max(1, a.reviewedCount)))[0] || null;

    const rows = filtered
      .map((o) => {
        const isFav = favs.includes(`${o.color}|${o.family}`);
        const winRate = pct(o.win, o.games.length);
        const avgAcc = o.reviewedCount ? (o.accSum / o.reviewedCount).toFixed(0) : '—';
        const avgMistakeMove = o.firstMistakePlies.length
          ? Math.round(o.firstMistakePlies.reduce((x, y) => x + y, 0) / o.firstMistakePlies.length / 2)
          : null;

        return `
          <div class="grow" style="cursor:pointer;padding:12px 14px;display:flex;align-items:center;gap:12px;" data-fam="${esc(o.family)}">
            <button class="fav-star-btn" data-fav-fam="${esc(o.family)}" data-fav-col="${o.color}" style="background:none;border:0;font-size:18px;color:${isFav ? 'var(--gold)' : '#666'};cursor:pointer;">
              ${isFav ? '★' : '☆'}
            </button>
            <div style="flex:1;min-width:0;">
              <b style="font-size:15px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(o.family)}</b>
              <div class="muted small" style="margin-top:2px;">
                ${o.games.length} games · Win: <span class="g">${winRate}%</span> · Acc: <b>${avgAcc}%</b>
                ${avgMistakeMove ? ` · Mistakes begin ~move ${avgMistakeMove}` : ''}
              </div>
            </div>
            <div class="wdl" style="width:100px;height:10px;">
              <i class="w" style="flex:${o.win}"></i>
              <i class="d" style="flex:${o.draw}"></i>
              <i class="l" style="flex:${o.loss}"></i>
            </div>
            <span class="muted" style="font-size:13px;">▾</span>
          </div>`;
      })
      .join('');

    main.innerHTML = `
    <div class="openings-page">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 class="ptitle" style="margin:0">Opening Lab & Repertoire</h2>
          <div class="muted small">Analyze repertoire performance and pinpoint early game mistakes.</div>
        </div>
        <div class="chips" style="margin:0;">
          <button class="chip${activeColor === 'white' ? ' on' : ''}" data-color="white">♔ White Repertoire</button>
          <button class="chip${activeColor === 'black' ? ' on' : ''}" data-color="black">♚ Black Repertoire</button>
        </div>
      </div>

      <!-- Quick Intelligence Cards -->
      <div class="grid2" style="margin-bottom:14px;">
        <div class="card pad">
          <div class="ctitle" style="font-size:14px;color:var(--green);">★ Most Successful Opening</div>
          ${
            mostSuccessful
              ? `<b style="font-size:16px;">${esc(mostSuccessful.family)}</b>
                 <div class="muted small" style="margin-top:2px;">${mostSuccessful.win} wins in ${mostSuccessful.games.length} games (${pct(mostSuccessful.win, mostSuccessful.games.length)}% score)</div>`
              : '<div class="muted small">Play at least 2 games with an opening to see your top performer.</div>'
          }
        </div>
        <div class="card pad">
          <div class="ctitle" style="font-size:14px;color:var(--red);">⚠ Highest Mistake Rate</div>
          ${
            highestMistakes && highestMistakes.mistakesCount > 0
              ? `<b style="font-size:16px;">${esc(highestMistakes.family)}</b>
                 <div class="muted small" style="margin-top:2px;">${highestMistakes.mistakesCount} mistakes in ${highestMistakes.reviewedCount} reviewed games</div>`
              : '<div class="muted small">No significant mistake concentrations found. Clean play!</div>'
          }
        </div>
      </div>

      <!-- Filters & Search -->
      <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <input type="text" id="op-search" placeholder="Search opening name…" value="${esc(filterSearch)}" style="background:#3d3b38;border:0;border-radius:6px;padding:8px 12px;flex:1;min-width:180px;font-size:14px;" />
        <select id="op-tc-filter" style="background:#3d3b38;border:0;border-radius:6px;padding:8px 10px;">
          <option value="all" ${filterTc === 'all' ? 'selected' : ''}>All Time Controls</option>
          <option value="rapid" ${filterTc === 'rapid' ? 'selected' : ''}>Rapid</option>
          <option value="blitz" ${filterTc === 'blitz' ? 'selected' : ''}>Blitz</option>
          <option value="bullet" ${filterTc === 'bullet' ? 'selected' : ''}>Bullet</option>
        </select>
      </div>

      ${selectedOpening ? renderDetailCard(selectedOpening) : ''}

      <div class="card glist">${rows || '<div class="pad muted">No openings found matching your criteria.</div>'}</div>
    </div>`;
  }

  function renderDetailCard(o) {
    const commonLines = Object.entries(o.variations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([line, count]) => `<li style="margin-bottom:4px;"><code>${esc(line)}</code> <span class="muted">(${count}x)</span></li>`)
      .join('');

    const gameList = o.games
      .slice(0, 5)
      .map((g) => {
        const mark = g.outcome === 'win' ? '+' : g.outcome === 'loss' ? '−' : '=';
        return `
          <button class="grow" data-open="${esc(g.id)}" style="padding:6px 8px;">
            <span class="res ${g.outcome}" style="width:22px;height:22px;font-size:13px">${mark}</span>
            <span class="gmain">
              <b>vs ${esc(g.opp)} (${g.oppRating})</b>
              <span class="muted small">${cap(g.timeClass)} · ${ago(g.endTime)}</span>
            </span>
            <span class="muted small">Review</span>
          </button>`;
      })
      .join('');

    return `
      <div class="card pad" style="background:var(--card2);border:1px solid var(--line);margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div>
            <div class="ctitle" style="margin:0;">${esc(o.family)} (${cap(o.color)})</div>
            <div class="muted small">${o.games.length} games played · ${pct(o.win, o.games.length)}% score</div>
          </div>
          <button class="btn ghost small" data-act="close-detail">✕ Close</button>
        </div>

        ${
          commonLines
            ? `<div class="sect" style="font-size:13px;">Common Variations from your games</div>
               <ul style="margin:4px 0 12px;padding-left:18px;font-size:13px;">${commonLines}</ul>`
            : ''
        }

        <div class="sect" style="font-size:13px;">Recent Games</div>
        <div class="glist" style="margin-bottom:10px;">${gameList}</div>

        <div style="display:flex;gap:8px;">
          <a class="btn small" href="#/puzzles">Practice Opening Blunders</a>
        </div>
      </div>`;
  }

  main.onclick = (e) => {
    const starBtn = e.target.closest('[data-fav-fam]');
    if (starBtn) {
      e.stopPropagation();
      toggleFavoriteOpening(starBtn.dataset.favFam, starBtn.dataset.favCol);
      return render();
    }

    const colBtn = e.target.closest('[data-color]');
    if (colBtn) {
      activeColor = colBtn.dataset.color;
      selectedOpening = null;
      return render();
    }

    const closeBtn = e.target.closest('[data-act="close-detail"]');
    if (closeBtn) {
      selectedOpening = null;
      return render();
    }

    const famRow = e.target.closest('[data-fam]');
    if (famRow) {
      const fam = famRow.dataset.fam;
      const list = Object.values(rep[activeColor] || {});
      selectedOpening = list.find((o) => o.family === fam) || null;
      return render();
    }

    const openGameBtn = e.target.closest('[data-open]');
    if (openGameBtn) {
      const id = openGameBtn.dataset.open;
      S.current = S.games.find((g) => g.id === id);
      S.startPly = 0;
      location.hash = '#/review';
    }
  };

  main.oninput = (e) => {
    if (e.target.id === 'op-search') {
      filterSearch = e.target.value;
      render();
    }
  };

  main.onchange = (e) => {
    if (e.target.id === 'op-tc-filter') {
      filterTc = e.target.value;
      render();
    }
  };

  render();
}

