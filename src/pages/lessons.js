import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import { allReviews, getLessonsState, saveLessonProgress } from '../services/storage.js';
import { esc, cap } from '../utils/util.js';

export const CORE_LESSONS = [
  {
    id: 'les_opening_principles',
    category: 'Opening principles',
    title: 'Control the Center Early',
    concept: 'In the opening, occupy and control the central squares (e4, d4, e5, d5) with pawns and pieces. Central control gives your pieces greater mobility and restricts your opponent.',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    question: 'White has occupied e4. What is Black\'s most classical, direct response to fight for the center?',
    expectedMove: 'e7e5',
    expectedSan: 'e5',
    answerExplain: 'Playing 1...e5 directly contests the center, opens diagonals for the queen and bishop, and prevents White from easily claiming d4.',
  },
  {
    id: 'les_piece_development',
    category: 'Piece development',
    title: 'Develop Knights Before Bishops',
    concept: 'Knights belong on active central squares (f3, c3, f6, c6) where their destination is obvious. Developing minor pieces quickly is essential before launching attacks.',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    question: 'Black just played 2...Nc6. How should White develop the light-squared bishop actively to pressure Black\'s center?',
    expectedMove: 'f1c4',
    expectedSan: 'Bc4',
    answerExplain: 'Bc4 develops the bishop onto a vibrant diagonal eyeing the vulnerable f7 square, setting up rapid kingside castling.',
  },
  {
    id: 'les_center_control',
    category: 'Center control',
    title: 'Strike the Center with c3 and d4',
    concept: 'Prepare a powerful pawn center. Building a two-pawn center (e4 + d4) creates space advantage and forces enemy knights to retreat.',
    fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    question: 'What preparatory pawn move readies a massive d2-d4 central push?',
    expectedMove: 'c2c3',
    expectedSan: 'c3',
    answerExplain: '1. c3 prepares 2. d4. If Black exchanges on d4, White recaptures with the c-pawn, dominating the entire center.',
  },
  {
    id: 'les_king_safety',
    category: 'King safety',
    title: 'Castle Early to Safety',
    concept: 'A king trapped in the center is an easy target for open files and sacrifice tactics. Castling tucks the king behind a solid pawn shield and activates your rook.',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5',
    question: 'White has developed the kingside minor pieces. What crucial defensive move secures the king?',
    expectedMove: 'e1g1',
    expectedSan: 'O-O',
    answerExplain: 'Castling kingside tucks White\'s king into the corner behind f2, g2, and h2, while bringing the h1 rook to the active f-file.',
  },
  {
    id: 'les_tactical_awareness',
    category: 'Tactical awareness',
    title: 'Spot the Knight Fork',
    concept: 'A fork occurs when a single piece attacks two or more enemy targets simultaneously. Knights are notorious for geometric forks because their move cannot be blocked.',
    fen: 'r1b1k2r/pp3ppp/2n1pn2/q1bp4/8/1PNBPN2/PBP2PPP/R2Q1RK1 w - - 0 10',
    question: 'Find the knight move that attacks both the black queen on a5 and the bishop on c5!',
    expectedMove: 'c3a4',
    expectedSan: 'Na4',
    answerExplain: 'Na4 attacks both the unprotected black queen and the bishop on c5, winning a tempo and disrupting Black\'s coordination.',
  },
  {
    id: 'les_positional_understanding',
    category: 'Positional understanding',
    title: 'Control Open Files with Rooks',
    concept: 'Rooks thrive on open and half-open files. An open file (no pawns on it) allows a rook to penetrate deep into the enemy position, especially onto the 7th rank.',
    fen: '2r2rk1/pp1b1ppp/1qn1pn2/3p4/3P4/1PN1PN2/P1Q1BPPP/R4RK1 w - - 0 12',
    question: 'Which move positions White\'s rook on the contested c-file opposite Black\'s queen?',
    expectedMove: 'f1c1',
    expectedSan: 'Rfc1',
    answerExplain: 'Rfc1 seizes the half-open c-file, directly aligning with Black\'s queen and preparing knight discoveries.',
  },
  {
    id: 'les_pawn_structures',
    category: 'Pawn structures',
    title: 'Creating and Utilizing Passed Pawns',
    concept: 'A passed pawn is a pawn with no opposing pawns on its file or adjacent files to stop its advance. In the endgame, a passed pawn becomes a game-winning queen candidate.',
    fen: '8/5pk1/4p1p1/3pP3/1P1P4/8/5K2/8 w - - 0 1',
    question: 'White has an outside passed pawn on b4. Push it forward to start the race to promotion!',
    expectedMove: 'b4b5',
    expectedSan: 'b5',
    answerExplain: 'Advancing b5 immediately puts Black under decisive pressure. The black king is too far outside the square of the pawn to stop it.',
  },
  {
    id: 'les_calculation_techniques',
    category: 'Calculation techniques',
    title: 'Look at Checks, Captures, and Threats',
    concept: 'When calculating candidate moves, always evaluate forcing moves in order: 1. Checks, 2. Captures, 3. Direct threats. Forcing moves narrow your opponent\'s responses.',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
    question: 'Find the tactical check that disrupts Black\'s king and wins back material with interest!',
    expectedMove: 'c4f7',
    expectedSan: 'Bxf7+',
    answerExplain: '1. Bxf7+! Kxf7 2. Nxe5+ or d3 forces the black king into the open, stripping castling rights and regaining the piece.',
  },
  {
    id: 'les_endgame_fundamentals',
    category: 'Endgame fundamentals',
    title: 'King Activity in the Endgame',
    concept: 'While the king must hide in the opening and middlegame, in the endgame the king becomes a powerful attacking and defending piece. March your king toward the center!',
    fen: '8/8/5k2/8/8/5P2/4K3/8 w - - 0 1',
    question: 'Activate your king toward the center to support the f-pawn.',
    expectedMove: 'e2e3',
    expectedSan: 'Ke3',
    answerExplain: 'Moving the king into the center (Ke3 or Ke4) is crucial. A centralized king controls key breakthrough squares and shepherds the pawn forward.',
  },
  {
    id: 'les_checkmate_patterns',
    category: 'Checkmate patterns',
    title: 'Back-Rank Mate',
    concept: 'A back-rank mate occurs when a rook or queen delivers checkmate along the back rank because the enemy king is trapped behind its own un-moved pawn shield.',
    fen: '6k1/5ppp/8/8/8/8/1r3PPP/4R1K1 w - - 0 1',
    question: 'Deliver immediate checkmate on Black\'s back rank!',
    expectedMove: 'e1e8',
    expectedSan: 'Re8#',
    answerExplain: 'Re8# delivers checkmate! Black\'s king is completely walled in by pawns on f7, g7, and h7.',
  },
  {
    id: 'les_time_management',
    category: 'Time management',
    title: 'Finding Candidate Moves Efficiently',
    concept: 'Do not calculate every legal move. Instead, quickly spot 2-3 logical candidate moves, evaluate their forcing responses, and commit without wasting your clock.',
    fen: 'r1b1k2r/pppp1ppp/8/4q3/1bP5/2N1P3/PP3PPP/R2QKB1R w KQkq - 0 10',
    question: 'Black has pinned your knight to your king. What active queen move defends the knight and attacks the bishop?',
    expectedMove: 'd1b3',
    expectedSan: 'Qb3',
    answerExplain: 'Qb3 defends the c3 knight while simultaneously counter-attacking Black\'s unprotected b4 bishop, resolving the pin cleanly.',
  },
];

export const ENDGAME_DRILLS = [
  {
    id: 'eg_opposition',
    title: 'Direct Opposition',
    category: 'Opposition',
    desc: 'Take the direct opposition with your king to deny the opponent passage.',
    fen: '8/8/5k2/8/8/8/4K3/8 w - - 0 1',
    target: 'Take opposition on e3',
    expectedMove: 'e2e3',
    expectedSan: 'Ke3',
    explain: 'Ke3 takes the opposition. With an odd number of squares between kings, the side that just moved holds the opposition.',
  },
  {
    id: 'eg_promotion',
    title: 'Pawn Promotion Race',
    category: 'Pawn promotion',
    desc: 'Escort your passed pawn with your king.',
    fen: '8/8/8/8/4K3/4P3/8/4k3 w - - 0 1',
    target: 'Advance the king in front of the pawn',
    expectedMove: 'e4e5',
    expectedSan: 'Ke5',
    explain: 'Advancing the king ahead of the pawn controls the key Queening squares (e6, e7, e8).',
  },
  {
    id: 'eg_rook_mate',
    title: 'King & Rook vs King (Box Method)',
    category: 'Basic checkmates',
    desc: 'Cut off the enemy king and shrink the box.',
    fen: '8/8/8/4k3/R7/4K3/8/8 w - - 0 1',
    target: 'Cut the king off along the 5th rank',
    expectedMove: 'a4a5',
    expectedSan: 'Ra5+',
    explain: 'Ra5+ confines the black king to ranks 6, 7, and 8, shrinking the box toward the edge of the board.',
  },
  {
    id: 'eg_queen_mate',
    title: 'King & Queen vs King',
    category: 'Basic checkmates',
    desc: 'Deliver the finishing checkmate supported by your king.',
    fen: 'k7/8/1K6/8/8/8/8/1Q6 w - - 0 1',
    target: 'Deliver mate on the back rank',
    expectedMove: 'b1h1',
    expectedSan: 'Qh1+ or Qg1',
    altMove: 'b1e4',
    explain: 'Coordinating queen and king seals off all escape squares and delivers mate.',
  },
];

function toDests(chess) {
  const dests = new Map();
  chess.moves({ verbose: true }).forEach((m) => {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  });
  return dests;
}

export function mountLessons(main, S) {
  const $ = (sel) => main.querySelector(sel);
  const lessonsState = getLessonsState();

  let activeSection = 'lessons'; // 'lessons' | 'endgame'
  let currentLesson = CORE_LESSONS[0];
  let cg = null;
  let statusMessage = '';
  let statusType = '';

  // Generate personalized lesson recommendation from saved reviews
  const saved = allReviews();
  let personalizedTitle = 'Stop Hanging Pieces';
  let personalizedReason = 'Based on your recent games, tactical blunders are your #1 point leak.';
  const mine = Object.values(saved).filter((r) => r.summary);
  if (mine.length) {
    let totalBlunders = 0;
    for (const r of mine) totalBlunders += (r.summary.blunders || []).length;
    if (totalBlunders >= 3) {
      personalizedTitle = 'Blunder Prevention: Stop Hanging Pieces';
      personalizedReason = `You have ${totalBlunders} recorded blunders in your reviewed games. This lesson trains active defense.`;
    }
  }

  function renderShell() {
    const isCompleted = lessonsState[currentLesson.id] && lessonsState[currentLesson.id].completed;
    const completedCount = Object.values(lessonsState).filter((s) => s.completed).length;

    const navItems = (activeSection === 'lessons' ? CORE_LESSONS : ENDGAME_DRILLS)
      .map(
        (l) => `
        <button class="grow lesson-list-item${currentLesson.id === l.id ? ' on' : ''}" data-lesson-id="${esc(l.id)}" style="padding:10px 12px;${currentLesson.id === l.id ? 'background:var(--card2);border-left:3px solid var(--green);' : ''}">
          <span style="font-size:16px;">${lessonsState[l.id] && lessonsState[l.id].completed ? '✅' : '♟'}</span>
          <div style="flex:1;min-width:0;">
            <b style="font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(l.title)}</b>
            <span class="muted small">${esc(l.category)}</span>
          </div>
        </button>`
      )
      .join('');

    main.innerHTML = `
    <div class="lessons-page">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 class="ptitle" style="margin:0">Personalized Lessons & Training</h2>
          <div class="muted small">${completedCount} of ${CORE_LESSONS.length + ENDGAME_DRILLS.length} activities completed</div>
        </div>
        <div class="chips" style="margin:0;">
          <button class="chip${activeSection === 'lessons' ? ' on' : ''}" data-sec="lessons">Core Lessons</button>
          <button class="chip${activeSection === 'endgame' ? ' on' : ''}" data-sec="endgame">Endgame Trainer</button>
        </div>
      </div>

      <!-- Personalized banner -->
      <div class="card pad" style="background:#211f1c;border-left:4px solid var(--gold);margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <b style="color:var(--gold);">Recommended For You: ${esc(personalizedTitle)}</b>
            <div class="muted small">${esc(personalizedReason)}</div>
          </div>
          <button class="btn small" data-lesson-id="les_tactical_awareness">Start Now</button>
        </div>
      </div>

      <div class="grid2">
        <div class="board-col">
          <div class="board-wrap">
            <div id="board"></div>
          </div>
          <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
            <div id="lesson-status" class="status-msg ${statusType}">${statusMessage || 'Play your move on the board'}</div>
            ${isCompleted ? '<span class="chip on" style="font-size:11px;">Completed</span>' : ''}
          </div>
        </div>

        <div class="lesson-panel">
          <div class="card pad">
            <div class="ctitle" style="margin-bottom:4px;">${esc(currentLesson.title)}</div>
            <div class="muted small" style="margin-bottom:10px;">Category: <b>${esc(currentLesson.category)}</b></div>
            
            <div class="sect">Concept</div>
            <p style="font-size:14px;line-height:1.4;margin:6px 0 12px;color:#dcdad6;">${esc(currentLesson.concept || currentLesson.desc)}</p>
            
            <div class="sect" style="color:var(--gold);">Challenge</div>
            <p style="font-size:13px;font-weight:700;margin:4px 0 12px;">${esc(currentLesson.question || currentLesson.target)}</p>

            <div style="display:flex;gap:8px;margin-top:12px;">
              <button class="btn ghost small" data-act="hint">💡 Hint</button>
              <button class="btn ghost small" data-act="solution">👁 Solution</button>
              <button class="btn small" data-act="reset">Reset Position</button>
            </div>
          </div>

          <div class="card glist" style="max-height:280px;overflow-y:auto;border-radius:8px;">
            <div style="padding:10px 14px;border-bottom:1px solid var(--line);font-weight:800;font-size:13px;">
              ${activeSection === 'lessons' ? 'Lesson Curriculum (11 Categories)' : 'Endgame Categories'}
            </div>
            ${navItems}
          </div>
        </div>
      </div>
    </div>`;

    setupBoard();
  }

  function setupBoard() {
    const el = $('#board');
    if (!el) return;

    const chess = new Chess(currentLesson.fen);
    const turnColor = chess.turn() === 'w' ? 'white' : 'black';
    const dests = toDests(chess);

    cg = Chessground(el, {
      fen: currentLesson.fen,
      orientation: turnColor,
      turnColor,
      movable: {
        free: false,
        color: turnColor,
        dests,
        showDests: true,
        events: {
          after: (orig, dest) => handleMove(orig, dest, chess),
        },
      },
      highlight: { lastMove: true, check: true },
      animation: { duration: 150 },
    });
  }

  function handleMove(orig, dest, chess) {
    const moveUci = orig + dest;
    const isCorrect =
      moveUci === currentLesson.expectedMove ||
      (currentLesson.altMove && moveUci === currentLesson.altMove);

    if (isCorrect) {
      statusMessage = `★ Correct! ${currentLesson.answerExplain || currentLesson.explain}`;
      statusType = 'success';
      saveLessonProgress(currentLesson.id, true);
      updateStatus();
    } else {
      statusMessage = '✕ Not quite the best move. Try again or check the hint!';
      statusType = 'error';
      updateStatus();
      setTimeout(() => setupBoard(), 600);
    }
  }

  function updateStatus() {
    const sb = $('#lesson-status');
    if (sb) {
      sb.className = `status-msg ${statusType}`;
      sb.textContent = statusMessage;
    }
  }

  main.onclick = (e) => {
    const secBtn = e.target.closest('[data-sec]');
    if (secBtn) {
      activeSection = secBtn.dataset.sec;
      currentLesson = activeSection === 'lessons' ? CORE_LESSONS[0] : ENDGAME_DRILLS[0];
      statusMessage = '';
      statusType = '';
      return renderShell();
    }

    const itemBtn = e.target.closest('[data-lesson-id]');
    if (itemBtn) {
      const id = itemBtn.dataset.lessonId;
      const found = [...CORE_LESSONS, ...ENDGAME_DRILLS].find((l) => l.id === id);
      if (found) {
        currentLesson = found;
        statusMessage = '';
        statusType = '';
        return renderShell();
      }
    }

    const actBtn = e.target.closest('[data-act]');
    if (!actBtn) return;
    const act = actBtn.dataset.act;

    if (act === 'reset') {
      statusMessage = '';
      statusType = '';
      setupBoard();
      updateStatus();
    } else if (act === 'hint') {
      if (currentLesson.expectedMove && cg) {
        const orig = currentLesson.expectedMove.slice(0, 2);
        cg.setAutoShapes([{ orig, brush: 'paleGreen' }]);
        statusMessage = `💡 Hint: Focus on the piece on ${orig.toUpperCase()}`;
        statusType = 'info';
        updateStatus();
      }
    } else if (act === 'solution') {
      if (currentLesson.expectedMove && cg) {
        const orig = currentLesson.expectedMove.slice(0, 2);
        const dest = currentLesson.expectedMove.slice(2, 4);
        cg.setAutoShapes([{ orig, dest, brush: 'green' }]);
        statusMessage = `Solution: ${currentLesson.expectedSan || currentLesson.expectedMove}. ${currentLesson.answerExplain || currentLesson.explain}`;
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

