import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import { allReviews, getPuzzleState, recordPuzzleAttempt, getAllBlunderPuzzles } from '../services/storage.js';
import { CORE_LESSONS, ENDGAME_DRILLS } from './lessons.js';
import { esc, cap } from '../utils/util.js';

export { getAllBlunderPuzzles };

let cg = null;
let currentChess = null;
let puzzleStartingFen = '';
let isMoveAttempted = false;
let isSolved = false;
let hintShown = false;
let answerShown = false;
let statusMessage = '';
let statusType = ''; // 'success' | 'error' | 'info' | ''
let currentLichessPly = 0;

let puzzlePool = [];
let currentIndex = 0;

// Fisher-Yates array shuffle for pure random order
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate legal move destinations for Chessground
function toDests(chess) {
  const dests = new Map();
  chess.moves({ verbose: true }).forEach((m) => {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  });
  return dests;
}

// Build unified puzzle queue merging blunders, endgames, and tactics
async function getUnifiedPuzzlePool() {
  const list = [];

  // 1. Blunders from player's games (highlighted with "From Your Game" marker)
  const blunders = getAllBlunderPuzzles();
  for (const b of blunders) {
    if (b.fen && b.best) {
      list.push({
        id: b.id,
        fen: b.fen,
        bestMove: b.best,
        bestSan: b.bestSan,
        isBlunder: true,
        userSan: b.userSan,
        loss: b.loss || 0,
        phase: b.phase || 'middlegame',
        opp: b.opp || 'Opponent',
      });
    }
  }

  // 2. Curated endgame drills
  for (const eg of ENDGAME_DRILLS) {
    list.push({
      id: eg.id,
      fen: eg.fen,
      bestMove: eg.expectedMove,
      bestSan: eg.expectedSan,
      isBlunder: false,
      title: eg.title,
      category: eg.category,
      desc: eg.desc || eg.target,
    });
  }

  // 3. Core strategy lessons
  for (const l of CORE_LESSONS) {
    list.push({
      id: l.id,
      fen: l.fen,
      bestMove: l.expectedMove,
      bestSan: l.expectedSan,
      isBlunder: false,
      title: l.title,
      category: l.category,
      desc: l.concept || l.question,
    });
  }

  // 4. Bundled fallback tactics
  try {
    const tactics = await fetch('/puzzles.json').then((r) => r.json());
    if (Array.isArray(tactics)) {
      for (const t of tactics) {
        list.push({
          id: `tactic_${t.id}`,
          fen: t.fen,
          bestMove: t.solution ? t.solution[0] : '',
          bestSan: '',
          solution: t.solution,
          isBlunder: false,
          title: 'Tactical Challenge',
          rating: t.rating,
          desc: 'Find the winning tactical move for your side.',
        });
      }
    }
  } catch {}

  return shuffle(list);
}

export async function mountPuzzles(main, S) {
  const $ = (sel) => main.querySelector(sel);
  const pState = getPuzzleState();

  if (!puzzlePool.length) {
    puzzlePool = await getUnifiedPuzzlePool();
    currentIndex = 0;
  }

  if (currentIndex >= puzzlePool.length) {
    currentIndex = 0;
  }

  function renderShell() {
    const puzzle = puzzlePool[currentIndex];
    if (!puzzle) {
      main.innerHTML = '<div class="card pad">No puzzles available. Play some games or review them first!</div>';
      return;
    }

    // Marker presentation
    let markerHtml = '';
    if (puzzle.isBlunder) {
      markerHtml = `
        <div class="blunder-badge-card">
          <span class="marker blunder-marker">🚨 From Your Game</span>
          <div style="font-size:13px;margin-top:4px;color:#fff;">
            In your game vs <b>${esc(puzzle.opp)}</b>, you played <b class="r">${esc(puzzle.userSan)}</b>
            <span class="muted small">(~${Math.round(puzzle.loss)}% win loss · ${cap(puzzle.phase)})</span>.
          </div>
          <div class="muted small" style="margin-top:4px;">Find the engine's best continuation in this position!</div>
        </div>`;
    } else if (puzzle.category) {
      markerHtml = `
        <div class="puzzle-info-box">
          <span class="marker concept-marker">🏆 ${esc(puzzle.category)}</span>
          <div style="font-size:13px;font-weight:700;margin-top:4px;color:#fff;">${esc(puzzle.title || '')}</div>
          <div class="muted small" style="margin-top:2px;">${esc(puzzle.desc || 'Find the winning continuation.')}</div>
        </div>`;
    } else {
      markerHtml = `
        <div class="puzzle-info-box">
          <span class="marker tactic-marker">⚡ Tactical Challenge</span>
          <div class="muted small" style="margin-top:4px;">Find the winning move for your side.</div>
        </div>`;
    }

    main.innerHTML = `
    <div class="puzzles-container" style="max-width: 680px; margin: 0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 class="ptitle" style="margin:0">Puzzles</h2>
        <div class="streak-badge" title="Consecutive correct answers">
          🔥 Streak: <b>${pState.streak}</b> <span class="muted small">(Best: ${pState.bestStreak})</span>
        </div>
      </div>

      <div class="board-col">
        <div class="board-wrap">
          <div id="board"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px;flex-wrap:wrap;">
          <div id="status-bar" class="status-msg ${statusType}">
            ${statusMessage || 'Find the winning move'}
          </div>
          <button class="btn small" id="retry-btn-inline" data-act="retry" style="display:${isMoveAttempted && !isSolved ? 'inline-block' : 'none'};padding:4px 10px;font-size:12px;">↺ Try Again</button>
        </div>
      </div>

      ${markerHtml}

      <div class="puzzle-actions">
        <button class="btn small" id="retry-btn-actions" data-act="retry" style="display:${isMoveAttempted && !isSolved ? 'inline-flex' : 'none'};">↺ Try Again</button>
        <button class="btn ghost small" data-act="hint" ${hintShown || answerShown || isSolved ? 'disabled' : ''}>💡 Hint</button>
        <button class="btn ghost small" data-act="answer" ${answerShown || isSolved ? 'disabled' : ''}>👁 Answer</button>
        <button class="btn ${isSolved ? '' : 'ghost'} small" data-act="next">Next Puzzle ⏭</button>
      </div>
    </div>`;

    setupBoard();
  }

  function setupBoard() {
    const el = $('#board');
    const puzzle = puzzlePool[currentIndex];
    if (!el || !puzzle) return;

    puzzleStartingFen = puzzle.fen;
    currentChess = new Chess(puzzle.fen);
    isMoveAttempted = false;
    isSolved = false;
    currentLichessPly = 0;

    const turnColor = puzzle.fen.split(' ')[1] === 'w' ? 'white' : 'black';
    renderInteractiveBoard(turnColor);
  }

  function renderInteractiveBoard(turnColor) {
    const el = $('#board');
    if (!el || !currentChess) return;

    const dests = toDests(currentChess);

    cg = Chessground(el, {
      fen: currentChess.fen(),
      orientation: turnColor,
      turnColor,
      movable: {
        free: false,
        color: turnColor,
        dests,
        showDests: true,
        events: {
          after: (orig, dest) => handleUserMove(orig, dest),
        },
      },
      premovable: { enabled: false },
      highlight: { lastMove: true, check: true },
      animation: { duration: 150 },
    });
  }

  function handleUserMove(orig, dest) {
    if (!currentChess) return;

    const puzzle = puzzlePool[currentIndex];
    const turnColor = currentChess.turn() === 'w' ? 'white' : 'black';
    let expectedUci = '';

    if (puzzle.solution && puzzle.solution.length) {
      expectedUci = puzzle.solution[currentLichessPly] || '';
    } else {
      expectedUci = puzzle.bestMove || '';
    }

    // Determine promotion piece
    const piece = currentChess.get(orig);
    const isPawn = piece && piece.type === 'p';
    const isPromoRank = (piece && piece.color === 'w' && dest[1] === '8') || (piece && piece.color === 'b' && dest[1] === '1');
    let promotion = 'q';
    if (isPawn && isPromoRank && expectedUci && expectedUci.length === 5) {
      promotion = expectedUci[4];
    }

    // Check legality and execute move in chess.js
    const legalMove = currentChess.move({ from: orig, to: dest, promotion });
    if (!legalMove) {
      if (cg) cg.set({ fen: currentChess.fen() });
      return;
    }

    // Update board so the played piece STAYS on destination square
    const inCheck = currentChess.inCheck();
    if (cg) {
      cg.set({
        fen: currentChess.fen(),
        lastMove: [orig, dest],
        check: inCheck ? (currentChess.turn() === 'w' ? 'white' : 'black') : false,
      });
    }

    // Validate played move against puzzle solution
    const playedUci = orig + dest + (legalMove.promotion || '');
    const isCorrect = expectedUci && (playedUci === expectedUci || playedUci.startsWith(expectedUci.slice(0, 4)));

    if (isCorrect) {
      // Check for multi-move sequence
      if (puzzle.solution && currentLichessPly + 1 < puzzle.solution.length) {
        currentLichessPly++;
        const oppMoveUci = puzzle.solution[currentLichessPly];
        statusMessage = '✓ Good move! Keep going…';
        statusType = 'info';
        updateStatus();
        if (cg) cg.set({ movable: { dests: new Map() } });

        setTimeout(() => {
          currentChess.move({
            from: oppMoveUci.slice(0, 2),
            to: oppMoveUci.slice(2, 4),
            promotion: oppMoveUci[4] || undefined,
          });
          currentLichessPly++;
          const opponentInCheck = currentChess.inCheck();

          if (cg) {
            cg.set({
              fen: currentChess.fen(),
              lastMove: [oppMoveUci.slice(0, 2), oppMoveUci.slice(2, 4)],
              check: opponentInCheck ? (currentChess.turn() === 'w' ? 'white' : 'black') : false,
              movable: {
                color: turnColor,
                dests: toDests(currentChess),
                showDests: true,
                events: {
                  after: (o, d) => handleUserMove(o, d),
                },
              },
            });
          }
        }, 400);
      } else {
        // Solved!
        isSolved = true;
        isMoveAttempted = false;
        statusMessage = `★ Correct! ${puzzle.bestSan || playedUci} was the winning move!`;
        statusType = 'success';
        pState.streak++;
        if (pState.streak > pState.bestStreak) pState.bestStreak = pState.streak;
        recordPuzzleAttempt(puzzle.id, true, { theme: puzzle.phase, source: puzzle.isBlunder ? 'blunder' : 'drill' });
        if (cg) cg.set({ movable: { dests: new Map() } });
        updateStatus();
      }
    } else {
      // Incorrect move: piece remains visible on board, user can click retry
      isMoveAttempted = true;
      isSolved = false;
      statusMessage = '✕ That was not the best move. Try again!';
      statusType = 'error';
      recordPuzzleAttempt(puzzle.id, false, { theme: puzzle.phase, source: puzzle.isBlunder ? 'blunder' : 'drill' });
      if (cg) cg.set({ movable: { dests: new Map() } });
      updateStatus();
    }
  }

  function updateStatus() {
    const sb = $('#status-bar');
    if (sb) {
      sb.className = `status-msg ${statusType}`;
      sb.textContent = statusMessage;
    }
    const inlineRetry = $('#retry-btn-inline');
    if (inlineRetry) {
      inlineRetry.style.display = isMoveAttempted && !isSolved ? 'inline-block' : 'none';
    }
    const actionsRetry = $('#retry-btn-actions');
    if (actionsRetry) {
      actionsRetry.style.display = isMoveAttempted && !isSolved ? 'inline-flex' : 'none';
    }
    const badge = main.querySelector('.streak-badge');
    if (badge) {
      const ps = getPuzzleState();
      badge.innerHTML = `🔥 Streak: <b>${ps.streak}</b> <span class="muted small">(Best: ${ps.bestStreak})</span>`;
    }
  }

  main.onclick = (e) => {
    const actBtn = e.target.closest('[data-act]');
    if (!actBtn) return;
    const act = actBtn.dataset.act;

    if (act === 'retry') {
      if (puzzleStartingFen) {
        currentChess = new Chess(puzzleStartingFen);
        currentLichessPly = 0;
        isMoveAttempted = false;
        statusMessage = 'Try another move';
        statusType = '';
        const turnColor = puzzleStartingFen.split(' ')[1] === 'w' ? 'white' : 'black';
        renderInteractiveBoard(turnColor);
        if (cg) cg.setAutoShapes([]);
        updateStatus();
      }
    } else if (act === 'next') {
      statusMessage = '';
      statusType = '';
      isMoveAttempted = false;
      isSolved = false;
      hintShown = false;
      answerShown = false;
      currentIndex = (currentIndex + 1) % Math.max(1, puzzlePool.length);
      renderShell();
    } else if (act === 'hint') {
      hintShown = true;
      const puzzle = puzzlePool[currentIndex];
      const bestMove = puzzle ? (puzzle.solution ? puzzle.solution[currentLichessPly] : puzzle.bestMove) : '';
      if (bestMove && cg) {
        const orig = bestMove.slice(0, 2);
        cg.setAutoShapes([{ orig, brush: 'paleGreen' }]);
        statusMessage = `💡 Hint: Move the piece on ${orig.toUpperCase()}`;
        statusType = 'info';
        updateStatus();
      }
    } else if (act === 'answer') {
      answerShown = true;
      const puzzle = puzzlePool[currentIndex];
      const bestMove = puzzle ? (puzzle.solution ? puzzle.solution[currentLichessPly] : puzzle.bestMove) : '';
      const bestSan = puzzle ? puzzle.bestSan : '';
      if (bestMove && cg && puzzleStartingFen) {
        currentChess = new Chess(puzzleStartingFen);
        const turnColor = puzzleStartingFen.split(' ')[1] === 'w' ? 'white' : 'black';
        renderInteractiveBoard(turnColor);
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
