import { PowerDefinition, PowerId, PlayerPowerState } from '../types/game';

export const POWER_LIST: PowerDefinition[] = [
  {
    id: 'speed_burst',
    name: 'Hız Patlaması',
    shortName: 'Hız x1.5',
    description: '6 saniye boyunca doğru cevaplardan kazanılan puanları %50 artırır.',
    cooldownSeconds: 25,
    durationSeconds: 6,
    color: '#f59e0b',
  },
  {
    id: 'error_shield',
    name: 'Hata Kalkanı',
    shortName: 'Kalkan',
    description: 'Bir sonraki yanlış cevapta -5 puan cezasını ve combo sıfırlanmasını engeller.',
    cooldownSeconds: 30,
    color: '#38bdf8',
  },
  {
    id: 'detective',
    name: 'Dedektif',
    shortName: 'Dedektif',
    description: 'Seçili boş hücreye Sudoku kurallarına göre gelebilecek aday rakamları gösterir.',
    cooldownSeconds: 20,
    color: '#a855f7',
  },
  {
    id: 'combo_saver',
    name: 'Combo Kurtarıcı',
    shortName: 'Combo Koruma',
    description: 'Sonraki yanlış cevapta comboyu sıfırlamak yerine yalnızca 1 kademe düşürür.',
    cooldownSeconds: 30,
    color: '#10b981',
  },
  {
    id: 'region_hunter',
    name: 'Bölge Avcısı',
    shortName: 'Bölge +150',
    description: 'Tamamlanan bir sonraki 3×3 bölgenin bonusunu +100 yerine +150 puan yapar.',
    cooldownSeconds: 40,
    color: '#eab308',
  },
  {
    id: 'ice_strike',
    name: 'Buz Darbesi',
    shortName: 'Buz (5sn)',
    description: 'Rakibin tahtasını 5 saniye boyunca buzla kaplayarak görmesini engeller.',
    cooldownSeconds: 35,
    durationSeconds: 5,
    color: '#06b6d4',
  },
  {
    id: 'board_scramble',
    name: 'Tahta Karıştırıcı',
    shortName: 'Karıştır (5sn)',
    description: 'Rakibin kafasını karıştırmak için tahtasını 5 saniye boyunca sürekli karıştırır.',
    cooldownSeconds: 35,
    durationSeconds: 5,
    color: '#ec4899',
  },
];

export const POWER_DEFINITIONS: Record<PowerId, PowerDefinition> = POWER_LIST.reduce(
  (acc, def) => {
    acc[def.id] = def;
    return acc;
  },
  {} as Record<PowerId, PowerDefinition>
);

export const DEFAULT_SELECTED_POWERS: PowerId[] = [
  'ice_strike',
  'board_scramble',
  'speed_burst',
];

/**
 * Configurable balance parameters for Power Energy and Cooldowns.
 * Designed so players use each power roughly 2-4 times per match,
 * and energy rewards skillful play without ever bypassing base cooldowns.
 */
export const POWER_BALANCE_CONFIG = {
  PASSIVE_ENERGY_PER_SECOND: 1.5,
  CORRECT_MOVE_BASE_ENERGY: 8,
  COMBO_ENERGY_BONUS_PER_LEVEL: 2.5,
  MAX_COMBO_ENERGY_BONUS: 12,
  MAX_ENERGY: 100,
  INITIAL_ENERGY: 35,
  // Bounded cooldown acceleration on correct moves (never exceeds 25% of base cooldown)
  BASE_COOLDOWN_SHAVE_MS: 1000,
  COMBO_COOLDOWN_SHAVE_MS: 250,
  ENERGY_SURGE_SHAVE_MS: 2000,
  MAX_COOLDOWN_REDUCTION_RATIO: 0.25, // Maximum 25% of base cooldown can be shaved per cycle
};

export function createInitialPowerState(
  selectedPowers: PowerId[] = DEFAULT_SELECTED_POWERS
): PlayerPowerState {
  const validSelection =
    selectedPowers.length === 3
      ? Array.from(new Set(selectedPowers)).slice(0, 3)
      : DEFAULT_SELECTED_POWERS;

  return {
    selectedPowers: validSelection,
    cooldownUntil: {},
    cooldownReducedMs: {},
    energy: POWER_BALANCE_CONFIG.INITIAL_ENERGY,
    speedBurstUntil: null,
    hasErrorShield: false,
    hasComboSaver: false,
    hasRegionHunter: false,
    blindedUntil: null,
    scrambledUntil: null,
    usageCount: {},
  };
}

/**
 * Picks 3 tactical powers for the AI opponent.
 * AI draws from the powers it can use strategically against the player.
 */
export function pickAIPowers(): PowerId[] {
  const aiPool: PowerId[] = [
    'speed_burst',
    'error_shield',
    'combo_saver',
    'region_hunter',
    'ice_strike',
    'board_scramble',
  ];
  const shuffled = [...aiPool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}

export function getRemainingCooldownSeconds(
  state: PlayerPowerState,
  powerId: PowerId,
  now: number = Date.now()
): number {
  const until = state.cooldownUntil[powerId];
  if (!until || until <= now) return 0;
  return Math.max(0, (until - now) / 1000);
}

export function isPowerBuffCurrentlyActive(
  state: PlayerPowerState,
  powerId: PowerId,
  now: number = Date.now()
): boolean {
  switch (powerId) {
    case 'speed_burst':
      return Boolean(state.speedBurstUntil && state.speedBurstUntil > now);
    case 'error_shield':
      return state.hasErrorShield;
    case 'combo_saver':
      return state.hasComboSaver;
    case 'region_hunter':
      return state.hasRegionHunter;
    default:
      return false;
  }
}

/**
 * Applies bounded cooldown reduction to active cooldowns without ever exceeding
 * MAX_COOLDOWN_REDUCTION_RATIO (25%) of each power's base cooldown.
 */
function applyBoundedCooldownReduction(
  state: PlayerPowerState,
  shaveMs: number,
  now: number
): { cooldownUntil: Partial<Record<PowerId, number>>; cooldownReducedMs: Partial<Record<PowerId, number>> } {
  const nextCooldownUntil = { ...state.cooldownUntil };
  const nextReducedMs = { ...state.cooldownReducedMs };

  for (const powerId of state.selectedPowers) {
    const currentUntil = nextCooldownUntil[powerId];
    if (!currentUntil || currentUntil <= now) continue;

    const def = POWER_DEFINITIONS[powerId];
    const maxAllowedReductionMs = def.cooldownSeconds * 1000 * POWER_BALANCE_CONFIG.MAX_COOLDOWN_REDUCTION_RATIO;
    const alreadyReduced = nextReducedMs[powerId] || 0;
    const remainingReductionBudget = Math.max(0, maxAllowedReductionMs - alreadyReduced);

    if (remainingReductionBudget <= 0) continue;

    const actualShave = Math.min(shaveMs, remainingReductionBudget);
    // Never reduce cooldown below now + 1000ms via energy shave so cooldown is never skipped abruptly
    const minAllowedUntil = now + 1000;
    if (currentUntil > minAllowedUntil) {
      const applied = Math.min(actualShave, currentUntil - minAllowedUntil);
      nextCooldownUntil[powerId] = currentUntil - applied;
      nextReducedMs[powerId] = alreadyReduced + applied;
    }
  }

  return { cooldownUntil: nextCooldownUntil, cooldownReducedMs: nextReducedMs };
}

/**
 * Called when a player makes a correct Sudoku move.
 * Grants power energy (scaled with combo) and applies a bounded cooldown shave.
 */
export function applyEnergyOnCorrectMove(
  state: PlayerPowerState,
  newCombo: number,
  now: number = Date.now()
): PlayerPowerState {
  const comboBonus = Math.min(
    POWER_BALANCE_CONFIG.MAX_COMBO_ENERGY_BONUS,
    Math.max(0, newCombo - 1) * POWER_BALANCE_CONFIG.COMBO_ENERGY_BONUS_PER_LEVEL
  );
  const energyGain = POWER_BALANCE_CONFIG.CORRECT_MOVE_BASE_ENERGY + comboBonus;
  let nextEnergy = state.energy + energyGain;

  let totalShaveMs =
    POWER_BALANCE_CONFIG.BASE_COOLDOWN_SHAVE_MS +
    Math.min(1000, Math.max(0, newCombo - 1) * POWER_BALANCE_CONFIG.COMBO_COOLDOWN_SHAVE_MS);

  // If energy reaches 100, trigger a bounded Energy Surge (-2s within the 25% cap) and wrap energy to 50
  if (nextEnergy >= POWER_BALANCE_CONFIG.MAX_ENERGY) {
    totalShaveMs += POWER_BALANCE_CONFIG.ENERGY_SURGE_SHAVE_MS;
    nextEnergy = 50;
  }

  const { cooldownUntil, cooldownReducedMs } = applyBoundedCooldownReduction(
    state,
    totalShaveMs,
    now
  );

  return {
    ...state,
    energy: Math.min(POWER_BALANCE_CONFIG.MAX_ENERGY, nextEnergy),
    cooldownUntil,
    cooldownReducedMs,
  };
}

/**
 * Called periodically (e.g., once per second) during active match play.
 * Grants passive energy over time and cleans up expired buffs/debuffs.
 */
export function applyPassiveEnergyTick(
  state: PlayerPowerState,
  deltaSeconds: number = 1,
  now: number = Date.now()
): PlayerPowerState {
  let nextEnergy = Math.min(
    POWER_BALANCE_CONFIG.MAX_ENERGY,
    state.energy + POWER_BALANCE_CONFIG.PASSIVE_ENERGY_PER_SECOND * deltaSeconds
  );

  let cooldownUntil = state.cooldownUntil;
  let cooldownReducedMs = state.cooldownReducedMs;

  // If passive energy reaches 100 while any power is on cooldown, apply bounded surge
  const hasActiveCooldown = state.selectedPowers.some(
    pId => (state.cooldownUntil[pId] || 0) > now
  );
  if (nextEnergy >= POWER_BALANCE_CONFIG.MAX_ENERGY && hasActiveCooldown) {
    const res = applyBoundedCooldownReduction(
      state,
      POWER_BALANCE_CONFIG.ENERGY_SURGE_SHAVE_MS,
      now
    );
    cooldownUntil = res.cooldownUntil;
    cooldownReducedMs = res.cooldownReducedMs;
    nextEnergy = 55;
  }

  const speedBurstUntil =
    state.speedBurstUntil && state.speedBurstUntil <= now ? null : state.speedBurstUntil;
  const blindedUntil =
    state.blindedUntil && state.blindedUntil <= now ? null : state.blindedUntil;
  const scrambledUntil =
    state.scrambledUntil && state.scrambledUntil <= now ? null : state.scrambledUntil;

  return {
    ...state,
    energy: nextEnergy,
    cooldownUntil,
    cooldownReducedMs,
    speedBurstUntil,
    blindedUntil,
    scrambledUntil,
  };
}

/**
 * Starts the cooldown for a used power and resets its per-cycle reduction tracker.
 */
export function startPowerCooldown(
  state: PlayerPowerState,
  powerId: PowerId,
  now: number = Date.now()
): PlayerPowerState {
  const def = POWER_DEFINITIONS[powerId];
  const until = now + def.cooldownSeconds * 1000;
  // Consume a modest amount of energy on activation (visual feedback) without blocking usage
  const nextEnergy = Math.max(0, state.energy - 25);

  return {
    ...state,
    energy: nextEnergy,
    cooldownUntil: {
      ...state.cooldownUntil,
      [powerId]: until,
    },
    cooldownReducedMs: {
      ...state.cooldownReducedMs,
      [powerId]: 0,
    },
    usageCount: {
      ...state.usageCount,
      [powerId]: (state.usageCount[powerId] || 0) + 1,
    },
  };
}
