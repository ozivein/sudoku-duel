import React from 'react';
import { Timer, AlertTriangle, Flame, Snowflake } from 'lucide-react';

interface TurnTimerBarProps {
  turnTimeRemaining: number | null; // in seconds, max 5.0
  isSelected: boolean;
  onDeselect: () => void;
  combo: number;
  isIceStruck?: boolean;
}

export const TurnTimerBar: React.FC<TurnTimerBarProps> = ({
  turnTimeRemaining,
  isSelected,
  onDeselect,
  combo,
  isIceStruck = false,
}) => {
  if (!isSelected || turnTimeRemaining === null) {
    return (
      <div className="turn-timer-container idle">
        <span className="turn-timer-hint">
          ⚡ Hamle için tahtadan <strong>boş bir kare</strong> seç!
        </span>
      </div>
    );
  }

  const percentage = Math.max(0, Math.min(100, (turnTimeRemaining / 5.0) * 100));
  const isCritical = turnTimeRemaining <= 1.8;
  const isWarning = turnTimeRemaining <= 3.0 && !isCritical;

  let barClass = 'timer-bar-normal';
  if (isIceStruck) {
    barClass = 'timer-bar-iced';
  } else if (isCritical) {
    barClass = 'timer-bar-critical';
  } else if (isWarning) {
    barClass = 'timer-bar-warning';
  }

  return (
    <div
      className={`turn-timer-container active ${isCritical ? 'critical-glow' : ''} ${
        isIceStruck ? 'ice-strike-glow' : ''
      }`}
    >
      <div className="turn-timer-header">
        <div className="turn-timer-left">
          {isIceStruck ? (
            <Snowflake size={16} className="ice-icon pulse-fast" />
          ) : isCritical ? (
            <AlertTriangle size={16} className="warning-icon pulse-fast" />
          ) : (
            <Timer size={16} className="timer-icon" />
          )}
          <span className="turn-timer-text">
            Karar Süresi: <strong>{turnTimeRemaining.toFixed(1)}s</strong>
          </span>
          {isIceStruck && (
            <span className="ice-hit-pill">❄️ -1.0s</span>
          )}
          {combo > 0 && (
            <span className="turn-combo-pill">
              <Flame size={11} /> x{combo + 1}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDeselect}
          className="deselect-btn"
          title="Seçimi bırak"
        >
          ✕ Vazgeç
        </button>
      </div>

      <div className="turn-timer-track">
        <div
          className={`turn-timer-fill ${barClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
