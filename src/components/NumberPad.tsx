import React, { useEffect } from 'react';

interface NumberPadProps {
  onNumberSelect: (num: number) => void;
  disabled: boolean;
  onDeselect: () => void;
  candidateNumbers?: number[] | null;
}

export const NumberPad: React.FC<NumberPadProps> = ({
  onNumberSelect,
  disabled,
  onDeselect,
  candidateNumbers = null,
}) => {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  // Keyboard shortcut listener for fast desktop play
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        e.preventDefault();
        onNumberSelect(num);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDeselect();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onNumberSelect, onDeselect]);

  const hasCandidates = Boolean(candidateNumbers && candidateNumbers.length > 0);

  return (
    <div className={`number-pad-container ${disabled ? 'pad-disabled' : 'pad-active'}`}>
      <div className="number-pad-grid">
        {digits.map(num => {
          const isCandidate = hasCandidates && candidateNumbers!.includes(num);
          const isNonCandidate = hasCandidates && !candidateNumbers!.includes(num);

          return (
            <button
              key={num}
              type="button"
              className={`number-btn ${isCandidate ? 'number-btn-candidate' : ''} ${
                isNonCandidate ? 'number-btn-dimmed' : ''
              }`}
              disabled={disabled}
              onClick={() => onNumberSelect(num)}
              aria-label={`Rakam ${num}${isCandidate ? ' (Geçerli Aday)' : ''}`}
            >
              <span className="number-btn-text">{num}</span>
              {isCandidate && <span className="candidate-dot-badge" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
