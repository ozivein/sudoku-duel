import React from 'react';
import { CellData } from '../types/game';

interface CellViewProps {
  cell: CellData;
  isSelected: boolean;
  isOpponentSelected?: boolean;
  isRelated: boolean;
  isSameNumber: boolean;
  turnTimeRemaining: number | null;
  detectiveCandidates?: number[] | null;
  isScrambled?: boolean;
  onSelect: (cell: CellData) => void;
}

export const CellView: React.FC<CellViewProps> = ({
  cell,
  isSelected,
  isOpponentSelected = false,
  isRelated,
  isSameNumber,
  turnTimeRemaining,
  detectiveCandidates = null,
  isScrambled = false,
  onSelect,
}) => {
  const { row, col, initial, value, claimedBy, isError, justClaimed, justStolen, popupFeedback } = cell;

  // Thick borders for 3x3 blocks
  const isRightBlockEdge = col === 2 || col === 5;
  const isBottomBlockEdge = row === 2 || row === 5;

  let cellTypeClass = '';
  if (initial) {
    cellTypeClass = 'cell-initial';
  } else if (claimedBy === 'player') {
    cellTypeClass = 'cell-player animate-cell-pop';
  } else if (claimedBy === 'ai') {
    cellTypeClass = 'cell-ai animate-cell-pop';
  } else {
    cellTypeClass = 'cell-empty';
  }

  const isClash = isSelected && isOpponentSelected;

  const handleClick = () => {
    if (initial || claimedBy !== null) return;
    onSelect(cell);
  };

  return (
    <button
      type="button"
      className={`sudoku-cell ${cellTypeClass} ${isSelected ? 'cell-selected' : ''} ${
        isOpponentSelected && !isSelected ? 'cell-opponent-selected' : ''
      } ${isClash ? 'cell-clash-selected' : ''} ${
        isRelated && !isSelected ? 'cell-related' : ''
      } ${isSameNumber && !isSelected ? 'cell-same-number' : ''} ${
        isRightBlockEdge ? 'border-block-right' : ''
      } ${isBottomBlockEdge ? 'border-block-bottom' : ''} ${isError ? 'cell-shake' : ''} ${
        justStolen ? 'cell-stolen' : ''
      } ${justClaimed === 'ai' ? 'cell-ai-flash' : ''} ${
        justClaimed === 'player' ? 'cell-player-flash' : ''
      } ${isScrambled ? 'cell-scrambled-chaos' : ''}`}
      onClick={handleClick}
      disabled={initial || claimedBy !== null}
      aria-label={`Kare Satır ${row + 1}, Sütun ${col + 1}${
        value ? `, Değer ${value}` : ', Boş'
      }`}
    >
      {/* Pre-filled initial number or filled value */}
      {value !== null && <span className="cell-value">{value}</span>}

      {/* Detective candidate numbers inside selected empty cell */}
      {value === null && isSelected && detectiveCandidates && detectiveCandidates.length > 0 && (
        <span className="cell-detective-candidates" title={`Adaylar: ${detectiveCandidates.join(', ')}`}>
          {detectiveCandidates.join('·')}
        </span>
      )}

      {/* Affordance indicator for empty selectable cells */}
      {!initial && claimedBy === null && !isSelected && !isOpponentSelected && (
        <span className="empty-cell-dot" aria-hidden="true" />
      )}

      {/* Opponent Selection Target Indicator (Counter-play opportunity!) */}
      {isOpponentSelected && claimedBy === null && (
        <span className="opponent-target-badge" title="Rakip bu kareyi seçti! Önce sen çöz!">
          {isClash ? '⚔️' : '🎯'}
        </span>
      )}

      {/* Selected cell countdown pulse */}
      {isSelected && turnTimeRemaining !== null && (
        <span className="cell-mini-timer" aria-hidden="true">
          {turnTimeRemaining.toFixed(1)}s
        </span>
      )}

      {/* Localized Floating score or Steal badge right on the cell */}
      {popupFeedback && (
        <div
          className={`cell-floating-badge ${
            justStolen
              ? 'badge-stolen'
              : claimedBy === 'player'
              ? 'badge-player-score'
              : 'badge-ai-score'
          }`}
        >
          {popupFeedback}
        </div>
      )}

      {/* Small corner ownership indicator */}
      {claimedBy === 'player' && <span className="cell-owner-dot dot-player" />}
      {claimedBy === 'ai' && <span className="cell-owner-dot dot-ai" />}
    </button>
  );
};
