import React from 'react';
import { Swords } from 'lucide-react';

interface CountdownOverlayProps {
  countdown: number;
  player1Name: string;
  player2Name: string;
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({
  countdown,
  player1Name,
  player2Name,
}) => {
  return (
    <div className="countdown-overlay">
      <div className="countdown-card animate-scale-in">
        <div className="duel-matchup-header">
          <span className="matchup-name name-p1">{player1Name}</span>
          <Swords size={28} className="swords-icon animate-pop" />
          <span className="matchup-name name-p2">{player2Name}</span>
        </div>

        <div className="countdown-number-box">
          {countdown > 0 ? (
            <span key={countdown} className="countdown-big-number animate-pop">
              {countdown}
            </span>
          ) : (
            <span className="countdown-start-text animate-pop">
              BAŞLA! ⚔️
            </span>
          )}
        </div>

        <span className="countdown-subtext">Maç Başlıyor...</span>
      </div>
    </div>
  );
};
