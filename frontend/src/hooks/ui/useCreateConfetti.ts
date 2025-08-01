import confetti from "canvas-confetti";

export default function UseCreateConfetti(duration: number = 4000): void {
  const animationEnd = Date.now() + duration;
  const defaults: confetti.Options = {
    startVelocity: 30,
    spread: 360,
    ticks: 60,
    zIndex: 1,
  };

  const randomInRange = (min: number, max: number): number =>
    Math.random() * (max - min) + min;

  const interval = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);

    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      zIndex: 100,
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      zIndex: 100,
    });
  }, 250);
}
