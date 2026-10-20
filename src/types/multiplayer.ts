import { CellData, PlayerPowerState, PowerId } from '../types/game';

export interface RoomPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  score: number;
  combo: number;
  maxCombo: number;
  cellsClaimed: number;
  blocksWon: number;
  activeCellId?: string | null;
  cellSelectedAt?: number | null;
  powers: PlayerPowerState;
  connected: boolean;
  lastSeen: number;
}

export type RoomStatus = 'waiting' | 'countdown' | 'playing' | 'finished';

export interface AuthoritativeRoomState {
  roomCode: string;
  hostId: string;
  status: RoomStatus;
  players: Record<string, RoomPlayer>;
  playerOrder: string[]; // [p1Id, p2Id]
  cells: CellData[];
  conqueredBlocks: Record<number, string>; // blockIdx -> playerId
  matchStartTime: number | null; // epoch ms
  matchEndTime: number | null; // epoch ms
  durationSeconds: number; // 480 (8 minutes)
  countdownRemaining?: number; // 3, 2, 1
  winnerId?: string | null;
  isDraw?: boolean;
}

export type MultiplayerEvent =
  | {
      type: 'JOIN_ROOM';
      roomCode: string;
      player: { id: string; nickname: string; selectedPowers?: PowerId[] };
    }
  | { type: 'SYNC_STATE'; state: AuthoritativeRoomState }
  | { type: 'COUNTDOWN_TICK'; count: number }
  | { type: 'START_MATCH'; matchStartTime: number; matchEndTime: number }
  | { type: 'SELECT_CELL'; playerId: string; cellId: string | null; timestamp: number }
  | { type: 'SUBMIT_MOVE'; playerId: string; cellId: string; chosenNumber: number; timestamp: number }
  | {
      type: 'MOVE_RESULT';
      cellId: string;
      playerId: string;
      isCorrect: boolean;
      chosenNumber: number;
      claimedBy: string | null;
      scoreChange: number;
      newScore: number;
      newCombo: number;
      conqueredBlocks: Record<number, string>;
      stolenFromPlayerId?: string | null;
      speedBurstApplied?: boolean;
      shieldTriggered?: 'error_shield' | 'combo_saver' | null;
      blockBonusAwarded?: number; // 100 or 150
    }
  | {
      type: 'USE_POWER';
      playerId: string;
      powerId: PowerId;
      targetCellId?: string | null;
      timestamp: number;
    }
  | {
      type: 'POWER_RESULT';
      playerId: string;
      powerId: PowerId;
      success: boolean;
      reason?: string;
      targetPlayerId?: string | null;
      targetCellId?: string | null;
      candidates?: number[];
      effectUntil?: number;
    }
  | { type: 'REQUEST_REMATCH'; playerId: string }
  | { type: 'REMATCH_START'; state: AuthoritativeRoomState }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'HEARTBEAT'; playerId: string; timestamp: number };
