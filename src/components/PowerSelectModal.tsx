import React from 'react';
import { PowerId } from '../types/game';
import { POWER_LIST, POWER_DEFINITIONS } from '../utils/powers';
import { PowerIcon } from './PowerIcon';
import { Clock, Check, Sparkles, Play, ArrowLeft } from 'lucide-react';
import { soundManager } from '../utils/sound';

interface PowerSelectModalProps {
  selectedPowers: PowerId[];
  onChangeSelectedPowers: (powers: PowerId[]) => void;
  onConfirmStart: () => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  startButtonText?: string;
}

export const PowerSelectModal: React.FC<PowerSelectModalProps> = ({
  selectedPowers,
  onChangeSelectedPowers,
  onConfirmStart,
  onCancel,
  title = 'Özel Güçlerini Seç',
  subtitle = 'Maç boyunca kullanacağın 3 farklı gücü belirle (8 Dakikalık Düello)',
  startButtonText = 'BAŞLA',
}) => {
  const handleTogglePower = (powerId: PowerId) => {
    soundManager.playTap();
    if (selectedPowers.includes(powerId)) {
      onChangeSelectedPowers(selectedPowers.filter(id => id !== powerId));
    } else {
      if (selectedPowers.length < 3) {
        onChangeSelectedPowers([...selectedPowers, powerId]);
      } else {
        // Replace the oldest selected power if already 3 selected, or let user toggle smoothly
        onChangeSelectedPowers([...selectedPowers.slice(1), powerId]);
      }
    }
  };

  const isReady = selectedPowers.length === 3;

  return (
    <div className="lobby-overlay power-select-overlay">
      <div className="power-select-modal animate-scale-in">
        {/* Header */}
        <div className="power-select-header">
          <div className="game-logo-badge">
            <Sparkles size={13} /> MAÇ ÖNCESİ HAZIRLIK
          </div>
          <h2 className="power-select-title">{title}</h2>
          <p className="power-select-subtitle">{subtitle}</p>
        </div>

        {/* 3 Active Loadout Slots Preview */}
        <div className="power-slots-preview">
          {[0, 1, 2].map(slotIdx => {
            const pId = selectedPowers[slotIdx];
            const def = pId ? POWER_DEFINITIONS[pId] : null;
            return (
              <div
                key={slotIdx}
                className={`preview-slot ${def ? 'preview-slot-filled' : 'preview-slot-empty'}`}
                style={def ? { borderColor: def.color } : undefined}
                onClick={() => def && handleTogglePower(def.id)}
              >
                <span className="preview-slot-num">SLOT {slotIdx + 1}</span>
                {def ? (
                  <div className="preview-slot-content">
                    <span className="preview-slot-icon" style={{ color: def.color }}>
                      <PowerIcon powerId={def.id} size={18} />
                    </span>
                    <span className="preview-slot-name">{def.name}</span>
                  </div>
                ) : (
                  <span className="preview-slot-placeholder">Güç Seç...</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 6 Powers Grid */}
        <div className="power-cards-grid">
          {POWER_LIST.map(power => {
            const slotIndex = selectedPowers.indexOf(power.id);
            const isSelected = slotIndex !== -1;

            return (
              <button
                key={power.id}
                type="button"
                className={`power-select-card ${isSelected ? 'power-card-selected' : ''}`}
                style={
                  isSelected
                    ? {
                        borderColor: power.color,
                        boxShadow: `0 0 14px ${power.color}33`,
                      }
                    : undefined
                }
                onClick={() => handleTogglePower(power.id)}
              >
                <div className="power-card-top">
                  <div
                    className="power-card-icon-box"
                    style={{
                      background: `${power.color}22`,
                      color: power.color,
                      borderColor: `${power.color}55`,
                    }}
                  >
                    <PowerIcon powerId={power.id} size={18} />
                  </div>

                  <div className="power-card-meta">
                    <span className="power-card-name">{power.name}</span>
                    <span className="power-card-cooldown">
                      <Clock size={11} /> {power.cooldownSeconds} sn bekleme
                    </span>
                  </div>

                  <div
                    className={`power-card-check ${isSelected ? 'check-active' : ''}`}
                    style={isSelected ? { background: power.color } : undefined}
                  >
                    {isSelected ? (
                      <span className="slot-badge-num">{slotIndex + 1}</span>
                    ) : (
                      <Check size={12} />
                    )}
                  </div>
                </div>

                <p className="power-card-desc">{power.description}</p>
              </button>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="power-select-actions">
          <button
            type="button"
            className="primary-action-btn power-start-btn"
            disabled={!isReady}
            onClick={() => {
              if (!isReady) return;
              soundManager.playPowerActivate('speed_burst');
              onConfirmStart();
            }}
          >
            <Play size={18} />
            <span>
              {isReady ? `${startButtonText} (3/3 Güç Hazır)` : `3 Güç Seçin (${selectedPowers.length}/3)`}
            </span>
          </button>

          {onCancel && (
            <button type="button" className="text-back-btn" onClick={onCancel}>
              <ArrowLeft size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Geri Dön
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
