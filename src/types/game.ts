export type PlayerType = 'player' | 'ai';

export type PowerId =
  | 'speed_burst'
  | 'error_shield'
  | 'detective'
  | 'combo_saver'
  | 'region_hunter'
  | 'ice_strike'
  | 'board_scramble';

export interface PowerDefinition {
  id: PowerId;
  name: string;
  shortName: string;
  description: string;
  cooldownSeconds: number;
  durationSeconds?: number; // For timed effects (e.g. 6s speed_burst, 5s ice_strike, 5s board_scramble)
  color: string;
}

export interface PlayerPowerState {
  selectedPowers: PowerId[]; // 3 distinct chosen powers
  cooldownUntil: Partial<Record<PowerId, number>>; // epoch ms when cooldown finishes
  cooldownReducedMs: Partial<Record<PowerId, number>>; // bounded reduction already applied this cycle
  energy: number; // 0 to 100
  speedBurstUntil: number | null; // epoch ms when 6s +50% score buff ends
  hasErrorShield: boolean; // Active until next wrong answer
  hasComboSaver: boolean; // Active until next wrong answer
  hasRegionHunter: boolean; // Active until next 3x3 block conquest (+150 instead of +100)
  blindedUntil?: number | null; // epoch ms until which THIS player cannot see the board (hit by opponent's ice_strike)
  scrambledUntil?: number | null; // epoch ms until which THIS player's board continuously scrambles (hit by opponent's board_scramble)
  usageCount: Partial<Record<PowerId, number>>;
}

export interface CellData {
  id: string; // "r-c" e.g. "0-4"
  row: number; // 0 to 8
  col: number; // 0 to 8
  block: number; // 0 to 8
  solution: number; // 1 to 9
  initial: boolean; // Pre-filled starting cell
  value: number | null; // Current value displayed
  claimedBy: PlayerType | null; // 'player' | 'ai' | null
  claimedByPlayerId?: string | null; // Authoritative player ID in multiplayer
  isError?: boolean;
  justClaimed?: PlayerType | null; // Trigger impact shockwave
  justStolen?: boolean; // When AI snatches from under player's nose
  popupFeedback?: string | null; // Float score text right on cell
}

export interface PlayerStats {
  score: number;
  combo: number;
  maxCombo: number;
  cellsClaimed: number;
  blocksWon: number;
}

export interface FloatingNotification {
  id: string;
  text: string;
  color: string;
  type: 'correct' | 'wrong' | 'bonus' | 'timeout' | 'rush';
}

export interface BlockStatus {
  blockIndex: number;
  conqueredBy: PlayerType | null;
  totalEmptyInitially: number;
  claimedByPlayer: number;
  claimedByAi: number;
}

export type GameStatus = 'ready' | 'playing' | 'finished';
