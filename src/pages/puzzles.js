import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import { allReviews, getPuzzleState, recordPuzzleAttempt, getAllBlunderPuzzles } from '../services/storage.js';
import { esc, cap } from '../utils/util.js';

export { getAllBlunderPuzzles };

let activeTab = 'blunders'; // 'blunders' | 'lichess' | 'due'
let filterPhase = 'all'; // 'all' | 'opening' | 'middlegame' | 'endgame'
let currentPuzzleIndex = 0;
let currentLichessPuzzle = null;
let currentLichessPly = 0;
let cg = null;
let hintShown = false;
let answerShown = false;
let statusMessage = '';
let statusType = ''; // 'success' | 'error' | 'info' | ''

// Get legal moves dictionary for Chessground
function toDests(chess) {
  const dests = new Map();
  chess.moves({ verbose: true }).forEach((m) => {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  });
  return dests;
}

export function mountPuzzles(main, S) {
  const $ = (sel) => main.querySelector(sel);
  const pState = getPuzzleState();

  let blunders = getAllBlunderPuzzles();
  if (filterPhase !== 'all') {
    blunders = blunders.filter((p) => p.phase === filterPhase);
  }
  if (activeTab === 'due') {
    const now = Date.now();
    blunders = blunders.filter((p) => !p.solved || p.dueDate <= now);
  }

  if (currentPuzzleIndex >= blunders.length) currentPuzzleIndex = 0;

  function renderShell() {
    const puzzle = blunders[currentPuzzleIndex];
    const totalPuzzles = blunders.length;
    const solvedCount = blunders.filter((p) => p.solved).length;
    const dueCount = getAllBlunderPuzzles().filter((p) => !p.solved || p.dueDate <= Date.now()).length;

    main.innerHTML = `
    <div class="puzzles-container">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <h2 class="ptitle" style="margin:0">Tactical Puzzles</h2>
        <div class="puzzle-tabs chips" style="margin:0;">
          <button class="chip${activeTab === 'blunders' ? ' on' : ''}" data-tab="blunders">My Blunders (${blunders.length})</button>
          <button class="chip${activeTab === 'due' ? ' on' : ''}" data-tab="due">Due Today (${dueCount})</button>
          <button class="chip${activeTab === 'lichess' ? ' on' : ''}" data-tab="lichess">Lichess Practice</button>
        </div>
      </div>

      <div class="grid2">
        <div class="board-col">
          <div class="board-wrap">
            <div id="board"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
            <div id="status-bar" class="status-msg ${statusType}">${statusMessage || 'Find the best move'}</div>
            <div class="streak-badge" title="Consecutive correct answers">
              🔥 Streak: <b>${pState.streak}</b> <span class="muted small">(Best: ${pState.bestStreak})</span>
            </div>
          </div>
        </div>

        <div class="puzzle-side">
          <div class="card pad" id="puzzle-info-card">
            ${renderInfoCard(puzzle, solvedCount, totalPuzzles)}
          </div>
          <div class="card pad" style="margin-top:12px;">
            <div class="ctitle">Actions</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn ghost small" data-act="hint" ${hintShown || answerShown ? 'disabled' : ''}>💡 Hint</button>
              <button class="btn ghost small" data-act="answer" ${answerShown ? 'disabled' : ''}>👁 Show Answer</button>
              <button class="btn small" data-act="next">Next Puzzle ⏭</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    setupBoard();
  }

  function renderInfoCard(puzzle, solvedCount, total) {
    if (activeTab === 'lichess') {
      if (!currentLichessPuzzle) {
        return '<div class="muted small">Loading puzzle from Lichess…</div>';
      }
      const p = currentLichessPuzzle;
      const themes = (p.themes || []).map((t) => `<span class="chip" style="font-size:11px;padding:3px 8px;">${esc(t)}</span>`).join(' ');
      return `
        <div class="ctitle">Lichess Tactical Puzzle</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="acc" style="background:#4da6ff;">Rating ${p.rating || 1500}</span>
          <span class="muted small">ID: #${esc(p.id)}</span>
        </div>
        <div class="sect">Themes</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">${themes || 'General'}</div>
        <div class="muted small">Play the winning move for your side.</div>`;
    }

    if (!puzzle) {
      return `
        <div class="ctitle">No Blunders Found Yet</div>
        <p class="muted small">Review your games on the <a href="#/games">Games page</a> first! Whenever Stockfish detects a mistake or blunder, ChessCoach automatically turns it into a personalized puzzle.</p>
        <button class="btn small" data-tab="lichess" style="margin-top:8px;">Try Lichess Practice</button>`;
    }

    const phases = ['all', 'opening', 'middlegame', 'endgame'];
    const phaseChips = phases
      .map((ph) => `<button class="chip${filterPhase === ph ? ' on' : ''}" data-phase="${ph}" style="font-size:11px;padding:2px 8px;">${cap(ph)}</button>`)
      .join('');

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div class="ctitle" style="margin:0;">Blunder #${currentPuzzleIndex + 1} of ${total}</div>
        <span class="muted small">${solvedCount} solved</span>
      </div>
      <div class="chips" style="margin-bottom:10px;">${phaseChips}</div>
      <div style="background:#21201d;padding:10px;border-radius:6px;margin-bottom:10px;border-left:4px solid var(--red);">
        <div style="font-size:13px;">In your game, you played <b class="r">${esc(puzzle.userSan)}</b>.</div>
        <div class="muted small" style="margin-top:2px;">Evaluation loss: ~${Math.round(puzzle.loss)}% win chance (${cap(puzzle.phase)})</div>
      </div>
      <div class="muted small">Find the engine's best continuation in this position.</div>`;
  }

  function setupBoard() {
    const el = $('#board');
    if (!el) return;

    let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    let turnColor = 'white';
    let bestMoveUci = '';

    if (activeTab === 'lichess') {
      if (!currentLichessPuzzle) return;
      fen = currentLichessPuzzle.fen;
      turnColor = fen.split(' ')[1] === 'w' ? 'white' : 'black';
      bestMoveUci = currentLichessPuzzle.solution ? currentLichessPuzzle.solution[currentLichessPly] : '';
    } else {
      const p = blunders[currentPuzzleIndex];
      if (!p) return;
      fen = p.fen;
      turnColor = fen.split(' ')[1] === 'w' ? 'white' : 'black';
      bestMoveUci = p.best;
    }

    const chess = new Chess(fen);
    const dests = toDests(chess);

    cg = Chessground(el, {
      fen,
      orientation: turnColor,
      turnColor,
      movable: {
        free: false,
        color: turnColor,
        dests,
        events: {
          after: (orig, dest) => handleUserMove(orig, dest, chess, bestMoveUci),
        },
      },
      premovable: { enabled: false },
      highlight: { lastMove: true, check: true },
      animation: { duration: 150 },
    });
  }

  function handleUserMove(orig, dest, chess, expectedUci) {
    let promotion = 'q';
    const isPawn = chess.get(orig) && chess.get(orig).type === 'p';
    const isPromoRank = dest[1] === '8' || dest[1] === '1';
    if (isPawn && isPromoRank) {
      if (expectedUci && expectedUci.length === 5) {
        promotion = expectedUci[4];
      }
    }

    const moveUci = orig + dest + (isPawn && isPromoRank ? promotion : '');
    const isCorrect = expectedUci && moveUci.startsWith(expectedUci.slice(0, 4));

    if (activeTab === 'lichess') {
      const p = currentLichessPuzzle;
      if (isCorrect) {
        chess.move({ from: orig, to: dest, promotion });
        currentLichessPly++;
        const nextOpponentMove = p.solution[currentLichessPly];

        if (nextOpponentMove) {
          // Play opponent reply
          statusMessage = 'Good move! Keep going…';
          statusType = 'info';
          updateStatus();
          setTimeout(() => {
            chess.move({
              from: nextOpponentMove.slice(0, 2),
              to: nextOpponentMove.slice(2, 4),
              promotion: nextOpponentMove[4] || undefined,
            });
            currentLichessPly++;
            const nextBest = p.solution[currentLichessPly];
            cg.set({
              fen: chess.fen(),
              turnColor: chess.turn() === 'w' ? 'white' : 'black',
              movable: {
                color: chess.turn() === 'w' ? 'white' : 'black',
                dests: toDests(chess),
                events: {
                  after: (o, d) => handleUserMove(o, d, chess, nextBest),
                },
              },
            });
          }, 350);
        } else {
          // Puzzle completed!
          statusMessage = '★ Puzzle Solved! Excellent calculation!';
          statusType = 'success';
          pState.streak++;
          if (pState.streak > pState.bestStreak) pState.bestStreak = pState.streak;
          recordPuzzleAttempt(`lichess_${p.id}`, true, { theme: (p.themes || [])[0], rating: p.rating });
          updateStatus();
        }
      } else {
        statusMessage = '✕ Incorrect move. Try again!';
        statusType = 'error';
        recordPuzzleAttempt(`lichess_${p.id}`, false, { theme: (p.themes || [])[0], rating: p.rating });
        updateStatus();
        setTimeout(() => setupBoard(), 600);
      }
      return;
    }

    // Blunder puzzle
    const puzzle = blunders[currentPuzzleIndex];
    if (isCorrect) {
      statusMessage = `★ Correct! ${puzzle.bestSan || moveUci} was the winning move!`;
      statusType = 'success';
      recordPuzzleAttempt(puzzle.id, true, { theme: puzzle.phase, source: 'blunder' });
      puzzle.solved = true;
      updateStatus();
      cg.set({ movable: { dests: new Map() } });
    } else {
      statusMessage = '✕ That wasn\'t the best move. Try again or check hint!';
      statusType = 'error';
      recordPuzzleAttempt(puzzle.id, false, { theme: puzzle.phase, source: 'blunder' });
      updateStatus();
      setTimeout(() => setupBoard(), 600);
    }
  }

  function updateStatus() {
    const sb = $('#status-bar');
    if (sb) {
      sb.className = `status-msg ${statusType}`;
      sb.textContent = statusMessage;
    }
    const badge = main.querySelector('.streak-badge');
    if (badge) {
      const ps = getPuzzleState();
      badge.innerHTML = `🔥 Streak: <b>${ps.streak}</b> <span class="muted small">(Best: ${ps.bestStreak})</span>`;
    }
  }

  async function loadLichessPuzzle() {
    statusMessage = 'Loading tactical puzzle…';
    statusType = 'info';
    currentLichessPly = 0;
    hintShown = false;
    answerShown = false;
    renderShell();

    try {
      const res = await fetch('https://lichess.org/api/puzzle/daily', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('API_ERROR');
      const data = await res.json();
      currentLichessPuzzle = {
        id: data.puzzle.id,
        fen: data.puzzle.fen,
        solution: data.puzzle.solution,
        rating: data.puzzle.rating,
        themes: data.puzzle.themes,
      };
      statusMessage = 'Find the winning continuation';
      statusType = '';
      renderShell();
    } catch {
      // Fallback to local puzzles.json
      try {
        const local = await fetch('/puzzles.json').then((r) => r.json());
        const randomP = local[Math.floor(Math.random() * local.length)];
        currentLichessPuzzle = randomP;
        statusMessage = 'Find the winning continuation';
        statusType = '';
        renderShell();
      } catch (e) {
        statusMessage = 'Could not load puzzle: ' + e.message;
        statusType = 'error';
        updateStatus();
      }
    }
  }

  main.onclick = (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      activeTab = tabBtn.dataset.tab;
      statusMessage = '';
      statusType = '';
      hintShown = false;
      answerShown = false;
      if (activeTab === 'lichess') {
        loadLichessPuzzle();
      } else {
        renderShell();
      }
      return;
    }

    const phaseBtn = e.target.closest('[data-phase]');
    if (phaseBtn) {
      filterPhase = phaseBtn.dataset.phase;
      currentPuzzleIndex = 0;
      statusMessage = '';
      statusType = '';
      hintShown = false;
      answerShown = false;
      return mountPuzzles(main, S);
    }

    const actBtn = e.target.closest('[data-act]');
    if (!actBtn) return;
    const act = actBtn.dataset.act;

    if (act === 'next') {
      statusMessage = '';
      statusType = '';
      hintShown = false;
      answerShown = false;
      if (activeTab === 'lichess') {
        loadLichessPuzzle();
      } else {
        currentPuzzleIndex = (currentPuzzleIndex + 1) % Math.max(1, blunders.length);
        renderShell();
      }
    } else if (act === 'hint') {
      hintShown = true;
      let bestMove = '';
      if (activeTab === 'lichess' && currentLichessPuzzle) {
        bestMove = currentLichessPuzzle.solution[currentLichessPly] || '';
      } else if (blunders[currentPuzzleIndex]) {
        bestMove = blunders[currentPuzzleIndex].best;
      }
      if (bestMove && cg) {
        const orig = bestMove.slice(0, 2);
        cg.setAutoShapes([{ orig, brush: 'paleGreen' }]);
        statusMessage = `💡 Hint: Focus on the piece on ${orig.toUpperCase()}`;
        statusType = 'info';
        updateStatus();
      }
    } else if (act === 'answer') {
      answerShown = true;
      let bestMove = '';
      let bestSan = '';
      if (activeTab === 'lichess' && currentLichessPuzzle) {
        bestMove = currentLichessPuzzle.solution[currentLichessPly] || '';
      } else if (blunders[currentPuzzleIndex]) {
        bestMove = blunders[currentPuzzleIndex].best;
        bestSan = blunders[currentPuzzleIndex].bestSan;
      }
      if (bestMove && cg) {
        const orig = bestMove.slice(0, 2);
        const dest = bestMove.slice(2, 4);
        cg.setAutoShapes([{ orig, dest, brush: 'green' }]);
        statusMessage = `Solution: ${bestSan || bestMove}`;
        statusType = 'info';
        updateStatus();
      }
    }
  };

  S.cleanup = () => {
    if (cg) cg.destroy();
  };

  renderShell();
}

