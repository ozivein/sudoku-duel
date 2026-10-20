import React from 'react';
import { PlayerStats } from '../types/game';
import { Trophy, RotateCcw, Award, Zap, Grid3X3, Skull, Home } from 'lucide-react';

interface GameOverModalProps {
  playerStats: PlayerStats;
  aiStats: PlayerStats;
  onRematch: () => void;
  onReturnToLobby?: () => void;
  playerName?: string;
  opponentName?: string;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  playerStats,
  aiStats,
  onRematch,
  onReturnToLobby,
  playerName = 'SEN',
  opponentName = 'BOT',
}) => {
  const isWinner = playerStats.score > aiStats.score;
  const isDraw = playerStats.score === aiStats.score;

  return (
    <div className="modal-backdrop">
      <div className="game-over-modal animate-scale-in">
        {/* Result Header */}
        <div className={`modal-header ${isWinner ? 'header-win' : isDraw ? 'header-draw' : 'header-lose'}`}>
          <div className="trophy-icon-wrapper">
            {isWinner ? (
              <Trophy size={42} className="trophy-win animate-bounce" />
            ) : isDraw ? (
              <Award size={42} className="trophy-draw" />
            ) : (
              <Skull size={42} className="trophy-lose" />
            )}
          </div>
          <h2 className="modal-title">
            {isWinner ? 'ZAFER SENİN!' : isDraw ? 'BERABERE BİTTİ!' : 'MAĞLUBİYET!'}
          </h2>
          <p className="modal-subtitle">
            {isWinner
              ? `${playerName}, mükemmel bir zafer kazandın!`
              : isDraw
              ? 'Kıran kırana geçen efsane bir mücadeleydi!'
              : `${opponentName} bu maçı kazandı. Rövanşta şansını dene!`}
          </p>
        </div>

        {/* Score Duel Display */}
        <div className="modal-score-duel">
          <div className={`duel-side ${isWinner ? 'winner-glow' : ''}`}>
            <span className="side-title">{playerName.toUpperCase()}</span>
            <span className="side-score score-player">{playerStats.score}</span>
          </div>
          <div className="vs-badge">VS</div>
          <div className={`duel-side ${!isWinner && !isDraw ? 'winner-glow' : ''}`}>
            <span className="side-title">{opponentName.toUpperCase()}</span>
            <span className="side-score score-ai">{aiStats.score}</span>
          </div>
        </div>

        {/* Match Statistics */}
        <div className="stats-list">
          <div className="stat-row">
            <span className="stat-player-val">{playerStats.cellsClaimed}</span>
            <span className="stat-label">
              <Zap size={14} /> Alınan Kareler
            </span>
            <span className="stat-ai-val">{aiStats.cellsClaimed}</span>
          </div>

          <div className="stat-row">
            <span className="stat-player-val">x{playerStats.maxCombo}</span>
            <span className="stat-label">
              <Award size={14} /> En Yüksek Kombo
            </span>
            <span className="stat-ai-val">{aiStats.maxCombo}</span>
          </div>

          <div className="stat-row">
            <span className="stat-player-val">{playerStats.blocksWon}</span>
            <span className="stat-label">
              <Grid3X3 size={14} /> 3x3 Bölge Bonusu (+100)
            </span>
            <span className="stat-ai-val">{aiStats.blocksWon}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="modal-actions-column">
          <button
            type="button"
            onClick={onRematch}
            className="rematch-btn"
            autoFocus
          >
            <RotateCcw size={18} />
            <span>RÖVANŞ OYNA</span>
          </button>

          {onReturnToLobby && (
            <button
              type="button"
              onClick={onReturnToLobby}
              className="lobby-return-btn"
            >
              <Home size={16} />
              <span>LOBİYE DÖN</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
