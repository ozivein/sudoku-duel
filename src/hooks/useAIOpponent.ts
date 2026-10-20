import { useEffect, useRef } from 'react';
import { CellData, GameStatus, PlayerPowerState, PowerId } from '../types/game';
import { getRemainingCooldownSeconds, isPowerBuffCurrentlyActive } from '../utils/powers';

interface UseAIOpponentProps {
  gameStatus: GameStatus;
  cells: CellData[];
  playerScore: number;
  aiScore: number;
  aiCombo: number;
  aiPowerState: PlayerPowerState;
  onAIMove: (cellId: string, chosenNumber: number, isCorrect: boolean) => void;
  onAIUsePower?: (powerId: PowerId) => void;
  onAIThinkingStatus?: (isThinking: boolean) => void;
  onAISelectCell?: (cellId: string | null) => void;
}

export function useAIOpponent({
  gameStatus,
  cells,
  playerScore,
  aiScore,
  aiCombo,
  aiPowerState,
  onAIMove,
  onAIUsePower,
  onAIThinkingStatus,
  onAISelectCell,
}: UseAIOpponentProps) {
  const timerRef = useRef<number | null>(null);
  const lastPowerUsedAtRef = useRef<number>(0);

  const onAIMoveRef = useRef(onAIMove);
  onAIMoveRef.current = onAIMove;
  const onAIUsePowerRef = useRef(onAIUsePower);
  onAIUsePowerRef.current = onAIUsePower;
  const onAIThinkingStatusRef = useRef(onAIThinkingStatus);
  onAIThinkingStatusRef.current = onAIThinkingStatus;
  const onAISelectCellRef = useRef(onAISelectCell);
  onAISelectCellRef.current = onAISelectCell;

  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const aiComboRef = useRef(aiCombo);
  aiComboRef.current = aiCombo;
  const aiPowerStateRef = useRef(aiPowerState);
  aiPowerStateRef.current = aiPowerState;

  useEffect(() => {
    if (gameStatus !== 'playing') {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      onAIThinkingStatusRef.current?.(false);
      onAISelectCellRef.current?.(null);
      return;
    }

    let isCancelled = false;

    const computeBlockStats = (currentCells: CellData[]) => {
      const blockStats: Record<
        number,
        { emptyCount: number; aiCount: number; playerCount: number; cells: CellData[] }
      > = {};
      for (let b = 0; b < 9; b++) {
        blockStats[b] = { emptyCount: 0, aiCount: 0, playerCount: 0, cells: [] };
      }

      currentCells.forEach(c => {
        if (!c.initial) {
          if (c.claimedBy === 'ai') blockStats[c.block].aiCount++;
          else if (c.claimedBy === 'player') blockStats[c.block].playerCount++;
          else {
            blockStats[c.block].emptyCount++;
            blockStats[c.block].cells.push(c);
          }
        }
      });

      return blockStats;
    };

    const pickTargetCell = (currentCells: CellData[]): CellData | null => {
      const emptyCells = currentCells.filter(c => !c.initial && c.claimedBy === null);
      if (emptyCells.length === 0) return null;

      const blockStats = computeBlockStats(currentCells);

      // 1. Try to complete a block if AI is close and player has 0 claims in it
      for (let b = 0; b < 9; b++) {
        const stats = blockStats[b];
        if (stats.emptyCount === 1 && stats.playerCount === 0 && stats.cells.length > 0) {
          return stats.cells[0];
        }
      }

      // 2. Try to block player if player is 1 cell away from conquering a block
      for (let b = 0; b < 9; b++) {
        const stats = blockStats[b];
        if (stats.emptyCount === 1 && stats.aiCount === 0 && stats.cells.length > 0) {
          return stats.cells[0];
        }
      }

      // 3. Fallback: Pick a cell from a block AI already started, or random empty
      const preferredBlocks = Object.entries(blockStats)
        .filter(([, stats]) => stats.cells.length > 0)
        .sort((a, b) => b[1].aiCount - a[1].aiCount);

      if (preferredBlocks.length > 0 && Math.random() < 0.6) {
        const targetBlockCells = preferredBlocks[0][1].cells;
        return targetBlockCells[Math.floor(Math.random() * targetBlockCells.length)];
      }

      return emptyCells[Math.floor(Math.random() * emptyCells.length)];
    };

    // Evaluate tactical AI power usage right before making a move
    const evaluateTacticalPowerBeforeMove = (targetCell: CellData) => {
      const now = Date.now();
      if (now - lastPowerUsedAtRef.current < 10000) return;

      const pState = aiPowerStateRef.current;
      const blockStats = computeBlockStats(cellsRef.current);
      const targetBlock = blockStats[targetCell.block];

      const canUse = (id: PowerId) =>
        pState.selectedPowers.includes(id) &&
        getRemainingCooldownSeconds(pState, id, now) <= 0 &&
        !isPowerBuffCurrentlyActive(pState, id, now);

      // Priority 1: Region Hunter when AI is 1 or 2 cells away from completing an uncontested 3x3 block
      if (
        canUse('region_hunter') &&
        targetBlock &&
        targetBlock.playerCount === 0 &&
        targetBlock.aiCount >= 2 &&
        targetBlock.emptyCount <= 2
      ) {
        lastPowerUsedAtRef.current = now;
        onAIUsePowerRef.current?.('region_hunter');
        return;
      }

      // Priority 2: Speed Burst when AI has an active combo (>= 2) and is about to score
      if (canUse('speed_burst') && aiComboRef.current >= 2 && Math.random() < 0.65) {
        lastPowerUsedAtRef.current = now;
        onAIUsePowerRef.current?.('speed_burst');
        return;
      }

      // Priority 3: Ice Strike (5s opponent board blind) or Board Scramble (5s opponent board scramble)
      if (canUse('ice_strike') && Math.random() < 0.45) {
        lastPowerUsedAtRef.current = now;
        onAIUsePowerRef.current?.('ice_strike');
        return;
      }

      if (canUse('board_scramble') && Math.random() < 0.45) {
        lastPowerUsedAtRef.current = now;
        onAIUsePowerRef.current?.('board_scramble');
        return;
      }

      // Priority 4: Error Shield when AI has a high combo (>= 3) at risk
      if (canUse('error_shield') && aiComboRef.current >= 3 && Math.random() < 0.6) {
        lastPowerUsedAtRef.current = now;
        onAIUsePowerRef.current?.('error_shield');
        return;
      }

      // Priority 5: Combo Saver when AI has combo >= 2 and Error Shield isn't active
      if (
        canUse('combo_saver') &&
        !pState.hasErrorShield &&
        aiComboRef.current >= 2 &&
        Math.random() < 0.55
      ) {
        lastPowerUsedAtRef.current = now;
        onAIUsePowerRef.current?.('combo_saver');
        return;
      }
    };

    // Schedule next AI move
    const scheduleNextMove = () => {
      if (isCancelled || gameStatus !== 'playing') return;

      const scoreDiff = aiScore - playerScore;
      let minDelay = 3500;
      let maxDelay = 5500;

      if (scoreDiff > 30) {
        minDelay = 4500;
        maxDelay = 6500;
      } else if (scoreDiff < -30) {
        minDelay = 3000;
        maxDelay = 4500;
      }

      const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

      let preselectedCellId: string | null = null;

      // 2.2 seconds before making its move, AI selects a cell on the board
      const selectNoticeTime = Math.max(800, delay - 2200);
      const thinkNoticeTimer = setTimeout(() => {
        if (!isCancelled) {
          const now = Date.now();
          // If AI is blinded by player's Ice Strike, AI cannot see the board to select a cell!
          if (aiPowerStateRef.current.blindedUntil && aiPowerStateRef.current.blindedUntil > now) {
            onAIThinkingStatusRef.current?.(false);
            onAISelectCellRef.current?.(null);
            return;
          }

          const target = pickTargetCell(cellsRef.current);
          if (target) {
            preselectedCellId = target.id;
            onAIThinkingStatusRef.current?.(true);
            onAISelectCellRef.current?.(target.id);
            evaluateTacticalPowerBeforeMove(target);
          }
        }
      }, selectNoticeTime);

      timerRef.current = window.setTimeout(() => {
        clearTimeout(thinkNoticeTimer);
        onAIThinkingStatusRef.current?.(false);
        onAISelectCellRef.current?.(null);

        if (isCancelled) return;

        const now = Date.now();
        // If AI is currently blinded by player's Ice Strike (5s), AI cannot see the board and skips its move!
        if (aiPowerStateRef.current.blindedUntil && aiPowerStateRef.current.blindedUntil > now) {
          scheduleNextMove();
          return;
        }

        // Check if the preselected cell is still empty (or if player sniped it!)
        let chosenCell = preselectedCellId
          ? cellsRef.current.find(
              c => c.id === preselectedCellId && !c.initial && c.claimedBy === null
            ) || null
          : null;

        if (!chosenCell && !preselectedCellId) {
          chosenCell = pickTargetCell(cellsRef.current);
        }

        if (chosenCell) {
          // If AI's board is scrambled by player's Board Scramble, AI gets confused (accuracy drops to 30%)!
          const isAIScrambled = Boolean(
            aiPowerStateRef.current.scrambledUntil && aiPowerStateRef.current.scrambledUntil > now
          );
          const accuracy = isAIScrambled ? 0.3 : 0.85;
          const isCorrect = Math.random() < accuracy;
          let chosenNumber = chosenCell.solution;

          if (!isCorrect) {
            const wrongOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(
              n => n !== chosenCell!.solution
            );
            chosenNumber = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
          }

          onAIMoveRef.current(chosenCell.id, chosenNumber, isCorrect);
        }

        // Schedule subsequent move
        scheduleNextMove();
      }, delay);
    };

    const initialWarmup = setTimeout(() => {
      scheduleNextMove();
    }, 2500);

    return () => {
      isCancelled = true;
      clearTimeout(initialWarmup);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      onAIThinkingStatusRef.current?.(false);
      onAISelectCellRef.current?.(null);
    };
  }, [gameStatus, playerScore, aiScore]);
}
