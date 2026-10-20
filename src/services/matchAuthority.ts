import { CellData, PowerId } from '../types/game';
import { AuthoritativeRoomState, RoomPlayer, MultiplayerEvent } from '../types/multiplayer';
import {
  generateDuelBoard,
  calculateMoveScore,
  isMoveCorrect,
  getValidSudokuCandidates,
} from '../utils/sudoku';
import {
  createInitialPowerState,
  DEFAULT_SELECTED_POWERS,
  getRemainingCooldownSeconds,
  isPowerBuffCurrentlyActive,
  startPowerCooldown,
  applyEnergyOnCorrectMove,
  applyPassiveEnergyTick,
} from '../utils/powers';

export class MatchAuthority {
  private state: AuthoritativeRoomState;
  private onBroadcast: (event: MultiplayerEvent) => void;
  private countdownTimer: number | null = null;
  private matchTimerCheck: number | null = null;
  private lastEnergyTickAt: number = Date.now();

  constructor(
    roomCode: string,
    hostPlayer: { id: string; nickname: string; selectedPowers?: PowerId[] },
    onBroadcast: (event: MultiplayerEvent) => void,
    existingCells?: CellData[]
  ) {
    this.onBroadcast = onBroadcast;
    const initialCells = existingCells || generateDuelBoard();

    const host: RoomPlayer = {
      id: hostPlayer.id,
      nickname: hostPlayer.nickname,
      isHost: true,
      score: 0,
      combo: 0,
      maxCombo: 0,
      cellsClaimed: 0,
      blocksWon: 0,
      activeCellId: null,
      cellSelectedAt: null,
      powers: createInitialPowerState(hostPlayer.selectedPowers || DEFAULT_SELECTED_POWERS),
      connected: true,
      lastSeen: Date.now(),
    };

    this.state = {
      roomCode: roomCode.toUpperCase(),
      hostId: hostPlayer.id,
      status: 'waiting',
      players: { [hostPlayer.id]: host },
      playerOrder: [hostPlayer.id],
      cells: initialCells,
      conqueredBlocks: {},
      matchStartTime: null,
      matchEndTime: null,
      durationSeconds: 480, // 8 minutes (480 seconds)
    };
  }

  getState(): AuthoritativeRoomState {
    return this.state;
  }

  // Handle player joining
  handlePlayerJoin(player: { id: string; nickname: string; selectedPowers?: PowerId[] }): void {
    if (this.state.players[player.id]) {
      // Reconnecting player or duplicate JOIN_ROOM handshake
      this.state.players[player.id].connected = true;
      this.state.players[player.id].lastSeen = Date.now();
      if (
        this.state.status === 'waiting' &&
        player.selectedPowers &&
        player.selectedPowers.length === 3
      ) {
        this.state.players[player.id].powers = createInitialPowerState(player.selectedPowers);
      }
      this.broadcastStateSync();
      if (this.state.status === 'countdown' && this.state.countdownRemaining !== undefined) {
        this.onBroadcast({ type: 'COUNTDOWN_TICK', count: this.state.countdownRemaining });
      }
      return;
    }

    if (this.state.playerOrder.length >= 2) {
      // Room already has 2 players; still broadcast state so observer/rejoiner sees status
      this.broadcastStateSync();
      return;
    }

    // Register second player
    const guest: RoomPlayer = {
      id: player.id,
      nickname: player.nickname,
      isHost: false,
      score: 0,
      combo: 0,
      maxCombo: 0,
      cellsClaimed: 0,
      blocksWon: 0,
      activeCellId: null,
      cellSelectedAt: null,
      powers: createInitialPowerState(player.selectedPowers || DEFAULT_SELECTED_POWERS),
      connected: true,
      lastSeen: Date.now(),
    };

    this.state.players[player.id] = guest;
    this.state.playerOrder.push(player.id);
    this.state.status = 'countdown';

    this.broadcastStateSync();
    this.startCountdown();
  }

  // Start 3-2-1 match countdown
  private startCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }

    let count = 3;
    this.state.countdownRemaining = count;
    this.broadcastStateSync();
    this.onBroadcast({ type: 'COUNTDOWN_TICK', count });

    this.countdownTimer = window.setInterval(() => {
      count--;
      this.state.countdownRemaining = count;

      if (count > 0) {
        this.onBroadcast({ type: 'COUNTDOWN_TICK', count });
      } else {
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
        this.startMatch();
      }
    }, 1000);
  }

  // Start official match with synchronized timestamps
  private startMatch(): void {
    const now = Date.now();
    const durationMs = this.state.durationSeconds * 1000;

    this.state.status = 'playing';
    this.state.matchStartTime = now;
    this.state.matchEndTime = now + durationMs;
    this.state.countdownRemaining = undefined;
    this.lastEnergyTickAt = now;

    this.broadcastStateSync();
    this.onBroadcast({
      type: 'START_MATCH',
      matchStartTime: this.state.matchStartTime,
      matchEndTime: this.state.matchEndTime,
    });

    // Setup periodic authoritative match timeout & passive energy check
    if (this.matchTimerCheck) clearInterval(this.matchTimerCheck);
    this.matchTimerCheck = window.setInterval(() => {
      const currentNow = Date.now();
      if (this.state.status === 'playing') {
        if (this.state.matchEndTime && currentNow >= this.state.matchEndTime) {
          this.finishMatch();
          return;
        }

        // Passive energy tick every ~1s
        const elapsedSec = (currentNow - this.lastEnergyTickAt) / 1000;
        if (elapsedSec >= 1.0) {
          this.lastEnergyTickAt = currentNow;
          Object.values(this.state.players).forEach(p => {
            p.powers = applyPassiveEnergyTick(p.powers, elapsedSec, currentNow);
          });
        }
      }
    }, 500);
  }

  // Player selected / focused a cell
  handleSelectCell(playerId: string, cellId: string | null, timestamp: number): void {
    const player = this.state.players[playerId];
    if (!player || this.state.status !== 'playing') return;

    player.activeCellId = cellId;
    player.cellSelectedAt = cellId ? timestamp : null;

    this.onBroadcast({
      type: 'SELECT_CELL',
      playerId,
      cellId,
      timestamp,
    });
  }

  // Authoritative Power Activation Validation & Execution
  handleUsePower(
    playerId: string,
    powerId: PowerId,
    targetCellId: string | null | undefined,
    _timestamp: number
  ): void {
    if (this.state.status !== 'playing') return;

    const now = Date.now();
    if (this.state.matchEndTime && now >= this.state.matchEndTime) {
      this.finishMatch();
      return;
    }

    const player = this.state.players[playerId];
    if (!player) return;

    // 1. Verify player actually equipped this power before the match
    if (!player.powers.selectedPowers.includes(powerId)) {
      this.onBroadcast({
        type: 'POWER_RESULT',
        playerId,
        powerId,
        success: false,
        reason: 'Bu güç seçili değil!',
      });
      return;
    }

    // 2. Verify cooldown has expired
    const cooldownRem = getRemainingCooldownSeconds(player.powers, powerId, now);
    if (cooldownRem > 0.1) {
      this.onBroadcast({
        type: 'POWER_RESULT',
        playerId,
        powerId,
        success: false,
        reason: `Güç bekleme süresinde (${Math.ceil(cooldownRem)}s)!`,
      });
      return;
    }

    // 3. Verify buff isn't already active
    if (isPowerBuffCurrentlyActive(player.powers, powerId, now)) {
      this.onBroadcast({
        type: 'POWER_RESULT',
        playerId,
        powerId,
        success: false,
        reason: 'Bu güç zaten aktif!',
      });
      return;
    }

    // 4. Power-specific validation & execution
    switch (powerId) {
      case 'speed_burst': {
        player.powers = startPowerCooldown(player.powers, 'speed_burst', now);
        player.powers.speedBurstUntil = now + 6000;
        this.broadcastStateSync();
        this.onBroadcast({
          type: 'POWER_RESULT',
          playerId,
          powerId,
          success: true,
        });
        break;
      }

      case 'error_shield': {
        player.powers = startPowerCooldown(player.powers, 'error_shield', now);
        player.powers.hasErrorShield = true;
        this.broadcastStateSync();
        this.onBroadcast({
          type: 'POWER_RESULT',
          playerId,
          powerId,
          success: true,
        });
        break;
      }

      case 'combo_saver': {
        player.powers = startPowerCooldown(player.powers, 'combo_saver', now);
        player.powers.hasComboSaver = true;
        this.broadcastStateSync();
        this.onBroadcast({
          type: 'POWER_RESULT',
          playerId,
          powerId,
          success: true,
        });
        break;
      }

      case 'region_hunter': {
        player.powers = startPowerCooldown(player.powers, 'region_hunter', now);
        player.powers.hasRegionHunter = true;
        this.broadcastStateSync();
        this.onBroadcast({
          type: 'POWER_RESULT',
          playerId,
          powerId,
          success: true,
        });
        break;
      }

      case 'detective': {
        const cellIdToInspect = targetCellId || player.activeCellId;
        if (!cellIdToInspect) {
          this.onBroadcast({
            type: 'POWER_RESULT',
            playerId,
            powerId,
            success: false,
            reason: 'Önce boş bir hücre seçmelisin!',
          });
          return;
        }

        const cell = this.state.cells.find(c => c.id === cellIdToInspect);
        if (!cell || cell.initial || cell.claimedBy !== null || cell.claimedByPlayerId) {
          this.onBroadcast({
            type: 'POWER_RESULT',
            playerId,
            powerId,
            success: false,
            reason: 'Seçili hücre zaten dolu!',
          });
          return;
        }

        const candidates = getValidSudokuCandidates(this.state.cells, cell);
        if (candidates.length === 0) {
          this.onBroadcast({
            type: 'POWER_RESULT',
            playerId,
            powerId,
            success: false,
            reason: 'Bu hücre için geçerli aday bulunamadı!',
          });
          return;
        }

        player.powers = startPowerCooldown(player.powers, 'detective', now);
        this.broadcastStateSync();
        this.onBroadcast({
          type: 'POWER_RESULT',
          playerId,
          powerId,
          success: true,
          targetCellId: cell.id,
          candidates,
        });
        break;
      }

      case 'ice_strike': {
        const opponentId = this.state.playerOrder.find(id => id !== playerId);
        const opponent = opponentId ? this.state.players[opponentId] : null;

        if (!opponent) {
          this.onBroadcast({
            type: 'POWER_RESULT',
            playerId,
            powerId,
            success: false,
            reason: 'Rakip bulunamadı!',
          });
          return;
        }

        const effectUntil = now + 5000;
        opponent.powers.blindedUntil = effectUntil;
        opponent.activeCellId = null;
        opponent.cellSelectedAt = null;
        player.powers = startPowerCooldown(player.powers, 'ice_strike', now);

        this.broadcastStateSync();
        this.onBroadcast({
          type: 'POWER_RESULT',
          playerId,
          powerId,
          success: true,
          targetPlayerId: opponentId,
          effectUntil,
        });
        break;
      }

      case 'board_scramble': {
        const opponentId = this.state.playerOrder.find(id => id !== playerId);
        const opponent = opponentId ? this.state.players[opponentId] : null;

        if (!opponent) {
          this.onBroadcast({
            type: 'POWER_RESULT',
            playerId,
            powerId,
            success: false,
            reason: 'Rakip bulunamadı!',
          });
          return;
        }

        const effectUntil = now + 5000;
        opponent.powers.scrambledUntil = effectUntil;
        player.powers = startPowerCooldown(player.powers, 'board_scramble', now);

        this.broadcastStateSync();
        this.onBroadcast({
          type: 'POWER_RESULT',
          playerId,
          powerId,
          success: true,
          targetPlayerId: opponentId,
          effectUntil,
        });
        break;
      }
    }
  }

  // Authoritative Move Validation
  handleSubmitMove(playerId: string, cellId: string, chosenNumber: number, timestamp: number): void {
    if (this.state.status !== 'playing') return;

    const player = this.state.players[playerId];
    if (!player) return;

    const now = Date.now();

    // Check if match expired
    if (this.state.matchEndTime && now > this.state.matchEndTime + 1000) {
      this.finishMatch();
      return;
    }

    const cellIndex = this.state.cells.findIndex(c => c.id === cellId);
    if (cellIndex === -1) return;

    const cell = this.state.cells[cellIndex];

    // 1. Check if cell is initial or already claimed
    if (cell.initial || cell.claimedBy !== null || cell.claimedByPlayerId) {
      // Cell is already taken! Send rejection
      this.onBroadcast({
        type: 'MOVE_RESULT',
        cellId,
        playerId,
        isCorrect: false,
        chosenNumber,
        claimedBy: cell.claimedByPlayerId || cell.claimedBy,
        scoreChange: 0,
        newScore: player.score,
        newCombo: player.combo,
        conqueredBlocks: this.state.conqueredBlocks,
        stolenFromPlayerId: playerId,
      });
      this.broadcastStateSync();
      return;
    }

    // 2. Check 5s turn timer validity (with 800ms grace period for network latency)
    if (player.cellSelectedAt) {
      const elapsedSeconds = (timestamp - player.cellSelectedAt) / 1000;
      if (elapsedSeconds > 5.8) {
        // Turn timer expired on authority!
        player.combo = 0;
        player.activeCellId = null;
        player.cellSelectedAt = null;
        this.onBroadcast({
          type: 'MOVE_RESULT',
          cellId,
          playerId,
          isCorrect: false,
          chosenNumber,
          claimedBy: null,
          scoreChange: 0,
          newScore: player.score,
          newCombo: 0,
          conqueredBlocks: this.state.conqueredBlocks,
        });
        this.broadcastStateSync();
        return;
      }
    }

    // 3. Evaluate answer correctness
    const isCorrect = isMoveCorrect(cell, chosenNumber);

    if (isCorrect) {
      // CORRECT ANSWER
      const newCombo = player.combo + 1;
      const baseScore = calculateMoveScore(newCombo);
      const speedBurstActive = Boolean(
        player.powers.speedBurstUntil && now <= player.powers.speedBurstUntil
      );
      const scoreGain = speedBurstActive ? Math.round(baseScore * 1.5) : baseScore;

      player.score += scoreGain;
      player.combo = newCombo;
      player.maxCombo = Math.max(player.maxCombo, newCombo);
      player.cellsClaimed += 1;
      player.activeCellId = null;
      player.cellSelectedAt = null;
      player.powers = applyEnergyOnCorrectMove(player.powers, newCombo, now);

      // Update cell in state
      this.state.cells[cellIndex] = {
        ...cell,
        value: chosenNumber,
        claimedBy: playerId === this.state.hostId ? 'player' : 'ai',
        claimedByPlayerId: playerId,
      };

      // Check if opponent was currently focusing on this cell (Stolen!)
      const opponentId = this.state.playerOrder.find(id => id !== playerId);
      let stolenFromId: string | null = null;
      if (opponentId && this.state.players[opponentId]?.activeCellId === cellId) {
        stolenFromId = opponentId;
        this.state.players[opponentId].activeCellId = null;
        this.state.players[opponentId].cellSelectedAt = null;
      }

      // Check 3x3 block conquest (+100 or +150 with Region Hunter)
      const blockBonusAwarded = this.checkBlockConquest(playerId);

      // Sync state first so board & scores update immediately, then send feedback event
      this.broadcastStateSync();
      this.onBroadcast({
        type: 'MOVE_RESULT',
        cellId,
        playerId,
        isCorrect: true,
        chosenNumber,
        claimedBy: playerId,
        scoreChange: scoreGain,
        newScore: player.score,
        newCombo,
        conqueredBlocks: this.state.conqueredBlocks,
        stolenFromPlayerId: stolenFromId,
        speedBurstApplied: speedBurstActive,
        blockBonusAwarded,
      });

      // Check if all contested cells are claimed
      const remaining = this.state.cells.filter(c => !c.initial && c.claimedBy === null);
      if (remaining.length === 0) {
        this.finishMatch();
      }
    } else {
      // WRONG ANSWER
      let newScore = player.score;
      let newCombo = 0;
      let shieldTriggered: 'error_shield' | 'combo_saver' | null = null;

      if (player.powers.hasErrorShield) {
        // Error Shield: prevents -5 penalty AND prevents combo reset, consumed on use
        player.powers.hasErrorShield = false;
        newScore = player.score;
        newCombo = player.combo;
        shieldTriggered = 'error_shield';
      } else if (player.powers.hasComboSaver) {
        // Combo Saver: normal -5 penalty, but combo only drops by 1 level instead of 0
        player.powers.hasComboSaver = false;
        newScore = Math.max(0, player.score - 5);
        newCombo = Math.max(0, player.combo - 1);
        shieldTriggered = 'combo_saver';
      } else {
        // Normal wrong answer: -5 penalty (clamped >= 0) and combo resets to 0
        newScore = Math.max(0, player.score - 5);
        newCombo = 0;
      }

      const scoreChange = newScore - player.score;

      player.score = newScore;
      player.combo = newCombo;
      player.activeCellId = null;
      player.cellSelectedAt = null;

      this.broadcastStateSync();
      this.onBroadcast({
        type: 'MOVE_RESULT',
        cellId,
        playerId,
        isCorrect: false,
        chosenNumber,
        claimedBy: null,
        scoreChange,
        newScore,
        newCombo,
        conqueredBlocks: this.state.conqueredBlocks,
        shieldTriggered,
      });
    }
  }

  // Check 3x3 block conquer (+100 or +150 if Region Hunter is active)
  private checkBlockConquest(playerId: string): number {
    let totalBonusAwarded = 0;
    const player = this.state.players[playerId];
    if (!player) return 0;

    for (let b = 0; b < 9; b++) {
      if (this.state.conqueredBlocks[b]) continue;

      const contested = this.state.cells.filter(c => c.block === b && !c.initial);
      if (contested.length === 0) continue;

      const allClaimedByPlayer = contested.every(c => c.claimedByPlayerId === playerId);

      if (allClaimedByPlayer) {
        this.state.conqueredBlocks[b] = playerId;
        const bonus = player.powers.hasRegionHunter ? 150 : 100;
        if (player.powers.hasRegionHunter) {
          player.powers.hasRegionHunter = false; // Consumed after 1 block
        }
        player.score += bonus;
        player.blocksWon += 1;
        totalBonusAwarded += bonus;
      }
    }

    return totalBonusAwarded;
  }

  // Conclude match
  finishMatch(): void {
    if (this.state.status === 'finished') return;

    if (this.matchTimerCheck) {
      clearInterval(this.matchTimerCheck);
      this.matchTimerCheck = null;
    }

    this.state.status = 'finished';

    const p1Id = this.state.playerOrder[0];
    const p2Id = this.state.playerOrder[1];

    if (p1Id && p2Id) {
      const p1Score = this.state.players[p1Id]?.score || 0;
      const p2Score = this.state.players[p2Id]?.score || 0;

      if (p1Score > p2Score) {
        this.state.winnerId = p1Id;
        this.state.isDraw = false;
      } else if (p2Score > p1Score) {
        this.state.winnerId = p2Id;
        this.state.isDraw = false;
      } else {
        this.state.winnerId = null;
        this.state.isDraw = true;
      }
    }

    this.broadcastStateSync();
  }

  // Reset match for rematch in same room
  handleRematch(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.matchTimerCheck) clearInterval(this.matchTimerCheck);

    this.state.cells = generateDuelBoard();
    this.state.conqueredBlocks = {};
    this.state.matchStartTime = null;
    this.state.matchEndTime = null;
    this.state.winnerId = null;
    this.state.isDraw = false;

    Object.values(this.state.players).forEach(p => {
      p.score = 0;
      p.combo = 0;
      p.maxCombo = 0;
      p.cellsClaimed = 0;
      p.blocksWon = 0;
      p.activeCellId = null;
      p.cellSelectedAt = null;
      p.powers = createInitialPowerState(p.powers.selectedPowers);
    });

    this.state.status = 'countdown';
    this.broadcastStateSync();
    this.startCountdown();
  }

  broadcastStateSync(): void {
    this.onBroadcast({
      type: 'SYNC_STATE',
      state: JSON.parse(JSON.stringify(this.state)),
    });
  }

  destroy(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.matchTimerCheck) clearInterval(this.matchTimerCheck);
  }
}
