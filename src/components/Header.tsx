import React from 'react';
import { PlayerStats } from '../types/game';
import { Volume2, VolumeX, Flame, Bot, User, Clock, Crown, AlertCircle } from 'lucide-react';

interface HeaderProps {
  matchTimeRemaining: number;
  playerStats: PlayerStats;
  aiStats: PlayerStats;
  aiThinking: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isFinalRush: boolean;
  playerName?: string;
  opponentName?: string;
  isMultiplayer?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  matchTimeRemaining,
  playerStats,
  aiStats,
  aiThinking,
  soundEnabled,
  onToggleSound,
  isFinalRush,
  playerName = 'SEN',
  opponentName = 'BOT',
  isMultiplayer = false,
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isWarning = matchTimeRemaining <= 60 && matchTimeRemaining > 10;
  const isCritical = matchTimeRemaining <= 10 && matchTimeRemaining > 0;

  // Score difference calculation for single-glance awareness
  const scoreDiff = playerStats.score - aiStats.score;
  const totalScore = playerStats.score + aiStats.score;
  const playerPercent = totalScore === 0 ? 50 : Math.round((playerStats.score / totalScore) * 100);

  return (
    <header className={`duel-header ${isFinalRush ? 'header-final-rush' : ''}`}>
      {/* Top row: Players, Match Timer, Volume */}
      <div className="header-main-row">
        {/* Player Card */}
        <div className={`player-card player-self ${scoreDiff > 0 ? 'leading-card' : ''}`}>
          <div className="avatar-wrap player-avatar">
            <User className="avatar-icon" size={16} />
            <span className="player-tag">{playerName.toUpperCase()}</span>
            {scoreDiff > 0 && <Crown size={12} className="lead-crown-icon" />}
          </div>
          <div className="score-wrap">
            <span className="score-label">SKOR</span>
            <span className="score-value">{playerStats.score}</span>
          </div>
          {playerStats.combo > 1 && (
            <div className="combo-badge combo-player animate-pop">
              <Flame size={12} className="combo-flame" />
              <span>x{playerStats.combo} COMBO</span>
            </div>
          )}
        </div>

        {/* Center Match Timer & Audio Control */}
        <div className="timer-section">
          <div
            className={`match-timer-badge ${
              isCritical ? 'timer-critical' : isWarning ? 'timer-warning' : ''
            }`}
            title="Toplam Maç Süresi"
          >
            <Clock size={15} className={`timer-clock-icon ${isCritical ? 'pulse-fast' : ''}`} />
            <span className="timer-digits">{formatTime(matchTimeRemaining)}</span>
          </div>

          <button
            className="audio-toggle-btn"
            onClick={onToggleSound}
            title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
            aria-label="Ses Ayarı"
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        </div>

        {/* Opponent Card (AI or Remote Player) */}
        <div className={`player-card player-ai ${scoreDiff < 0 ? 'leading-card' : ''}`}>
          <div className="avatar-wrap ai-avatar">
            {isMultiplayer ? (
              <User className="avatar-icon" size={16} />
            ) : (
              <Bot className="avatar-icon" size={16} />
            )}
            <span className="player-tag">{opponentName.toUpperCase()}</span>
            {scoreDiff < 0 && <Crown size={12} className="lead-crown-icon ai-lead-crown" />}
            {aiThinking && !isMultiplayer && (
              <span className="ai-thinking-dot" title="Düşünüyor..." />
            )}
          </div>
          <div className="score-wrap">
            <span className="score-label">SKOR</span>
            <span className="score-value">{aiStats.score}</span>
          </div>
          {aiStats.combo > 1 && (
            <div className="combo-badge combo-ai animate-pop">
              <Flame size={12} className="combo-flame" />
              <span>x{aiStats.combo} COMBO</span>
            </div>
          )}
        </div>
      </div>

      {/* Single-Glance Lead Bar (Tug-of-War Status) */}
      <div className="lead-status-row">
        <div className="lead-bar-track">
          <div
            className="lead-bar-player"
            style={{ width: `${playerPercent}%` }}
          />
        </div>
        <div className="lead-badge-container">
          {scoreDiff > 0 ? (
            <span className="lead-pill lead-player">
              <Crown size={11} /> +{scoreDiff} ÖNDESİN
            </span>
          ) : scoreDiff < 0 ? (
            <span className="lead-pill lead-ai">
              <AlertCircle size={11} /> {scoreDiff} GERİDESİN
            </span>
          ) : (
            <span className="lead-pill lead-tie">
              BAŞABAŞ MÜCADELE
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
