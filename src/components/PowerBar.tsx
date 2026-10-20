import React, { useState, useEffect } from 'react';
import { PlayerPowerState, PowerId } from '../types/game';
import {
  POWER_DEFINITIONS,
  getRemainingCooldownSeconds,
  isPowerBuffCurrentlyActive,
} from '../utils/powers';
import { PowerIcon } from './PowerIcon';
import { BatteryCharging } from 'lucide-react';

interface PowerBarProps {
  powerState: PlayerPowerState;
  onUsePower: (powerId: PowerId) => void;
  disabled: boolean; // True when match is finished or not playing
  hasSelectedEmptyCell: boolean; // Required for Detective
  detectiveCandidates?: number[] | null;
}

export const PowerBar: React.FC<PowerBarProps> = ({
  powerState,
  onUsePower,
  disabled,
  hasSelectedEmptyCell,
  detectiveCandidates = null,
}) => {
  const [now, setNow] = useState<number>(() => Date.now());
  const [justTriggeredId, setJustTriggeredId] = useState<PowerId | null>(null);

  useEffect(() => {
    if (disabled) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, [disabled]);

  const speedBurstRemainingSec =
    powerState.speedBurstUntil && powerState.speedBurstUntil > now
      ? (powerState.speedBurstUntil - now) / 1000
      : 0;

  const blindedRemainingSec =
    powerState.blindedUntil && powerState.blindedUntil > now
      ? (powerState.blindedUntil - now) / 1000
      : 0;

  const scrambledRemainingSec =
    powerState.scrambledUntil && powerState.scrambledUntil > now
      ? (powerState.scrambledUntil - now) / 1000
      : 0;

  const handleSlotClick = (powerId: PowerId) => {
    if (disabled) return;
    setJustTriggeredId(powerId);
    setTimeout(() => setJustTriggeredId(null), 350);
    onUsePower(powerId);
  };

  return (
    <div className="power-bar-wrapper">
      {/* Top micro row: Active Buff Pills + Energy Meter */}
      <div className="power-bar-status-row">
        <div className="active-buffs-strip">
          {speedBurstRemainingSec > 0 && (
            <span className="buff-pill buff-speed">
              ⚡ Hız x1.5 ({speedBurstRemainingSec.toFixed(1)}s)
            </span>
          )}
          {powerState.hasErrorShield && (
            <span className="buff-pill buff-shield">🛡️ Kalkan Aktif</span>
          )}
          {powerState.hasComboSaver && (
            <span className="buff-pill buff-combo">🔥 Combo Koruma</span>
          )}
          {powerState.hasRegionHunter && (
            <span className="buff-pill buff-region">👑 Bölge +150</span>
          )}
          {blindedRemainingSec > 0 && (
            <span className="buff-pill buff-ice-debuff">
              ❄️ Buzlandı ({blindedRemainingSec.toFixed(1)}s)
            </span>
          )}
          {scrambledRemainingSec > 0 && (
            <span className="buff-pill buff-scramble-debuff">
              🌀 Karışıyor ({scrambledRemainingSec.toFixed(1)}s)
            </span>
          )}
          {detectiveCandidates && detectiveCandidates.length > 0 && (
            <span className="buff-pill buff-detective">
              🔍 Adaylar: {detectiveCandidates.join(', ')}
            </span>
          )}
        </div>

        {/* Energy Meter */}
        <div
          className="power-energy-meter"
          title="Güç Enerjisi: Doğru cevaplar ve kombolar bekleme sürelerini hızlandırır"
        >
          <BatteryCharging size={12} className="energy-icon" />
          <div className="energy-track">
            <div
              className="energy-fill"
              style={{ width: `${Math.min(100, Math.round(powerState.energy))}%` }}
            />
          </div>
          <span className="energy-pct">{Math.round(powerState.energy)}%</span>
        </div>
      </div>

      {/* 3 Power Slots */}
      <div className="power-slots-row">
        {powerState.selectedPowers.map((powerId, idx) => {
          const def = POWER_DEFINITIONS[powerId];
          if (!def) return null;

          const cooldownRem = getRemainingCooldownSeconds(powerState, powerId, now);
          const isOnCooldown = cooldownRem > 0;
          const isBuffActive = isPowerBuffCurrentlyActive(powerState, powerId, now);

          // Only Detective requires a selected empty cell
          const needsCell = powerId === 'detective' && !hasSelectedEmptyCell;
          const isUnavailableContext = !isOnCooldown && !isBuffActive && needsCell;

          const cooldownProgress = isOnCooldown
            ? Math.min(100, (cooldownRem / def.cooldownSeconds) * 100)
            : 0;

          let statusText = 'HAZIR';
          if (powerId === 'speed_burst' && speedBurstRemainingSec > 0) {
            statusText = `${speedBurstRemainingSec.toFixed(1)}s AKTİF`;
          } else if (isBuffActive) {
            statusText = 'AKTİF';
          } else if (isOnCooldown) {
            statusText = `${Math.ceil(cooldownRem)}s`;
          } else if (needsCell) {
            statusText = 'Kare Seç';
          }

          return (
            <button
              key={`${powerId}-${idx}`}
              type="button"
              disabled={disabled || isOnCooldown || isBuffActive}
              onClick={() => handleSlotClick(powerId)}
              className={`power-slot-btn ${
                isBuffActive
                  ? 'slot-active-buff'
                  : isOnCooldown
                  ? 'slot-on-cooldown'
                  : isUnavailableContext
                  ? 'slot-context-wait'
                  : 'slot-ready'
              } ${justTriggeredId === powerId ? 'slot-just-triggered' : ''}`}
              style={
                !isOnCooldown
                  ? ({
                      '--power-color': def.color,
                    } as React.CSSProperties)
                  : undefined
              }
              title={`${def.name}: ${def.description}`}
            >
              {/* Cooldown fill overlay */}
              {isOnCooldown && (
                <div
                  className="slot-cooldown-fill"
                  style={{ width: `${cooldownProgress}%` }}
                />
              )}

              <div className="slot-icon-wrap" style={{ color: isOnCooldown ? '#64748b' : def.color }}>
                <PowerIcon powerId={powerId} size={15} />
              </div>

              <div className="slot-text-col">
                <span className="slot-title">{def.name}</span>
                <span className="slot-status">{statusText}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
