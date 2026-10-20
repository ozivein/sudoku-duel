import React, { useState, useEffect, useMemo } from 'react';
import { CellData } from '../types/game';
import { CellView } from './CellView';
import { Crown, Bot, Snowflake, Shuffle } from 'lucide-react';

interface BoardProps {
  cells: CellData[];
  selectedCellId: string | null;
  opponentSelectedCellId?: string | null;
  turnTimeRemaining: number | null;
  onSelectCell: (cell: CellData) => void;
  conqueredBlocks: Record<number, 'player' | 'ai'>;
  isFinalRush: boolean;
  detectiveCandidates?: number[] | null;
  blindedUntil?: number | null;
  scrambledUntil?: number | null;
}

export const Board: React.FC<BoardProps> = ({
  cells,
  selectedCellId,
  opponentSelectedCellId = null,
  turnTimeRemaining,
  onSelectCell,
  conqueredBlocks,
  isFinalRush,
  detectiveCandidates = null,
  blindedUntil = null,
  scrambledUntil = null,
}) => {
  const [now, setNow] = useState<number>(() => Date.now());
  const [scrambleTick, setScrambleTick] = useState<number>(0);

  const isBlinded = Boolean(blindedUntil && blindedUntil > now);
  const isScrambled = Boolean(scrambledUntil && scrambledUntil > now);

  // Fast timer when either 5s Ice Blind or 5s Board Scramble is active
  useEffect(() => {
    const hasActiveEffect =
      (blindedUntil && blindedUntil > Date.now()) ||
      (scrambledUntil && scrambledUntil > Date.now());

    if (!hasActiveEffect) return;

    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (scrambledUntil && scrambledUntil > current) {
        setScrambleTick(t => t + 1);
      }
    }, 180);

    return () => clearInterval(interval);
  }, [blindedUntil, scrambledUntil]);

  const blindedRemainingSec =
    blindedUntil && blindedUntil > now ? (blindedUntil - now) / 1000 : 0;
  const scrambledRemainingSec =
    scrambledUntil && scrambledUntil > now ? (scrambledUntil - now) / 1000 : 0;

  // When scrambled is active, continuously shuffle displayed cell order and displayed values every 180ms!
  const displayedCells = useMemo(() => {
    if (!isScrambled) return cells;

    // Create a deterministic-feeling chaotic permutation per scrambleTick so numbers & positions jump continuously
    const seed = scrambleTick + 1;
    const shuffled = [...cells];

    // Swap cell positions in the grid & randomize visible digits to confuse the player
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (i * 17 + seed * 31) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.map((cell, idx) => {
      if (cell.value === null) {
        // Occasionally flash phantom numbers in some empty cells to disorient
        const showPhantom = (idx + seed) % 4 === 0;
        return {
          ...cell,
          value: showPhantom ? ((idx * 7 + seed * 3) % 9) + 1 : null,
        };
      }
      const fakeDigit = ((cell.value + seed * 2 + idx) % 9) + 1;
      return {
        ...cell,
        value: fakeDigit,
      };
    });
  }, [cells, isScrambled, scrambleTick]);

  const selectedCell = cells.find(c => c.id === selectedCellId) || null;
  const selectedValue = selectedCell?.value ?? null;

  return (
    <div
      className={`sudoku-board-wrapper ${isFinalRush ? 'board-final-rush' : ''} ${
        isBlinded ? 'board-ice-blinded' : ''
      } ${isScrambled ? 'board-chaos-scrambling' : ''}`}
    >
      {/* Active Scramble Chaos Banner */}
      {isScrambled && !isBlinded && (
        <div className="scramble-chaos-banner">
          <Shuffle size={15} className="spin-chaos-icon" />
          <span>TAHTA KARIŞIYOR! ({scrambledRemainingSec.toFixed(1)}s)</span>
        </div>
      )}

      <div className="sudoku-board-grid">
        {displayedCells.map(cell => {
          const isSelected = cell.id === selectedCellId;
          const isOpponentSelected = Boolean(
            opponentSelectedCellId && cell.id === opponentSelectedCellId && cell.claimedBy === null
          );
          const isRelated =
            Boolean(selectedCell) &&
            (cell.row === selectedCell?.row ||
              cell.col === selectedCell?.col ||
              cell.block === selectedCell?.block);

          const isSameNumber =
            Boolean(selectedValue) && cell.value === selectedValue;

          return (
            <CellView
              key={isScrambled ? `${cell.id}-scr` : cell.id}
              cell={cell}
              isSelected={isSelected}
              isOpponentSelected={isOpponentSelected}
              isRelated={isRelated}
              isSameNumber={isSameNumber}
              turnTimeRemaining={isSelected ? turnTimeRemaining : null}
              detectiveCandidates={isSelected ? detectiveCandidates : null}
              isScrambled={isScrambled}
              onSelect={c => {
                if (isBlinded) return;
                // Find the real underlying cell by id
                const realCell = cells.find(orig => orig.id === c.id);
                if (realCell) onSelectCell(realCell);
              }}
            />
          );
        })}
      </div>

      {/* 3x3 Block Conquered Territorials (Watermark & Border, non-obstructive) */}
      <div className="block-overlays-container" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, blockIdx) => {
          const conquered = conqueredBlocks[blockIdx];
          const blockRow = Math.floor(blockIdx / 3);
          const blockCol = blockIdx % 3;

          return (
            <div
              key={blockIdx}
              className={`block-region-overlay ${
                conquered === 'player'
                  ? 'region-player'
                  : conquered === 'ai'
                  ? 'region-ai'
                  : ''
              }`}
              style={{
                gridRowStart: blockRow + 1,
                gridColumnStart: blockCol + 1,
              }}
            >
              {conquered === 'player' && (
                <div className="conquer-watermark watermark-player">
                  <Crown size={28} />
                  <span>FETHEDİLDİ</span>
                </div>
              )}
              {conquered === 'ai' && (
                <div className="conquer-watermark watermark-ai">
                  <Bot size={28} />
                  <span>BOT BÖLGESİ</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 5-Second Full Ice Blind Curtain (Buz Darbesi) */}
      {isBlinded && (
        <div className="ice-blind-curtain" role="alert" aria-live="polite">
          <div className="ice-blind-card">
            <Snowflake size={44} className="ice-blind-icon" />
            <h3 className="ice-blind-title">❄️ BUZ DARBESİ!</h3>
            <p className="ice-blind-desc">Rakip tahtanı dondurdu, tahta görünmüyor!</p>
            <div className="ice-blind-timer-pill">
              Buzun Çözülmesine: <strong>{blindedRemainingSec.toFixed(1)} sn</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
