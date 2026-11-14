import { Chess } from 'chess.js';
import { fmtEval } from '../utils/util.js';

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function getPieceMaterial(chess) {
  const board = chess.board();
  let whiteMat = 0;
  let blackMat = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        const val = PIECE_VALUES[piece.type] || 0;
        if (piece.color === 'w') whiteMat += val;
        else blackMat += val;
      }
    }
  }
  return { white: whiteMat, black: blackMat };
}

export function explainMove(reviewMove, verboseMove, evalBefore, evalAfter) {
  if (!reviewMove || !evalBefore || !evalAfter) return null;

  const color = reviewMove.color; // 'white' | 'black'
  const isWhite = color === 'white';
  const cls = reviewMove.cls; // 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

  if (cls === 'best' || cls === 'excellent') {
    return {
      text: `Excellent move! Maintains optimal piece coordination and pressure.`,
      tags: ['Accurate'],
      materialDiff: 0,
      bestSan: reviewMove.bestSan,
    };
  }

  const tags = [];
  let explanation = '';
  let matDiff = 0;

  try {
    const chessBefore = new Chess(reviewMove.fenBefore);
    const pieceMoved = chessBefore.get(verboseMove.from);
    const pieceCaptured = verboseMove.captured ? PIECE_NAMES[verboseMove.captured] : null;

    // Check material difference
    const chessAfter = new Chess(reviewMove.fenBefore);
    chessAfter.move({ from: verboseMove.from, to: verboseMove.to, promotion: verboseMove.promotion });
    const matBefore = getPieceMaterial(chessBefore);
    const matAfter = getPieceMaterial(chessAfter);

    const netBefore = isWhite ? matBefore.white - matBefore.black : matBefore.black - matBefore.white;
    const netAfter = isWhite ? matAfter.white - matAfter.black : matAfter.black - matAfter.white;
    matDiff = netAfter - netBefore;

    const myAdvBefore = isWhite ? evalBefore.cp : -evalBefore.cp;
    const myAdvAfter = isWhite ? evalAfter.cp : -evalAfter.cp;
    const cpLoss = myAdvBefore - myAdvAfter;

    // 1. Missed checkmate or winning attack
    if (evalBefore.mate != null && evalBefore.mate > 0 && (evalAfter.mate == null || evalAfter.mate <= 0)) {
      tags.push('Missed Mate');
      explanation = `Missed a forced checkmate! ${reviewMove.bestSan ? `${reviewMove.bestSan} led directly to victory.` : 'A winning sequence was available.'}`;
    }
    // 2. Hanging piece / Material blunder
    else if (matDiff < -1) {
      const lostPiece = pieceMoved ? PIECE_NAMES[pieceMoved.type] : 'piece';
      tags.push(`Lost ${cap(lostPiece)} (-${Math.abs(matDiff)})`);
      explanation = `Left your ${lostPiece} vulnerable or sacrificed material without sufficient compensation.`;
    }
    // 3. Piece left undefended / Hanging to opponent tactic
    else if (cpLoss >= 300) {
      tags.push('Tactical Blunder');
      if (reviewMove.bestSan) {
        explanation = `Overlooked a decisive tactical response. ${reviewMove.bestSan} would have maintained your advantage.`;
      } else {
        explanation = `A severe tactical mistake that swings the evaluation dramatically against you.`;
      }
    }
    // 4. King safety compromised
    else if (pieceMoved && pieceMoved.type === 'k' && !chessBefore.inCheck()) {
      tags.push('King Safety');
      explanation = `Moving your king here loosens your defenses and exposes the king to opponent checks.`;
    }
    // 5. Inaccuracy or Positional slip
    else if (cls === 'inaccuracy') {
      tags.push('Positional Inaccuracy');
      explanation = reviewMove.bestSan
        ? `Slightly passive. ${reviewMove.bestSan} was more active and maintained central tension.`
        : `A minor positional concession. Look for more active candidate moves.`;
    }
    // 6. General mistake
    else {
      tags.push('Missed Opportunity');
      explanation = reviewMove.bestSan
        ? `Missed a stronger tactical continuation. Best alternative was ${reviewMove.bestSan}.`
        : `This move relinquishes the initiative to your opponent.`;
    }
  } catch (err) {
    explanation = reviewMove.bestSan
      ? `Mistake. Stockfish recommends ${reviewMove.bestSan} instead.`
      : `Sub-optimal move that hands the advantage to your opponent.`;
  }

  return {
    text: explanation,
    tags,
    materialDiff: matDiff,
    bestSan: reviewMove.bestSan,
    evalBefore: fmtEval(evalBefore),
    evalAfter: fmtEval(evalAfter),
  };
}

