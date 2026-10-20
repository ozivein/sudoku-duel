import confetti from 'canvas-confetti';

export function fireVictoryConfetti() {
  const duration = 2.5 * 1000;
  const end = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'],
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'],
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };
  frame();
}

export function fireBlockBonusConfetti() {
  confetti({
    particleCount: 45,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#38bdf8', '#fbbf24', '#f43f5e', '#a855f7'],
  });
}
