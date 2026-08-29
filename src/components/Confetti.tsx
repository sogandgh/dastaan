import { useEffect, useState, type CSSProperties } from 'react';
import './Confetti.css';

const COLORS = ['var(--coral)', 'var(--mint)', 'var(--blue)', 'var(--sand)', 'var(--amber)', 'var(--blue-deep)'];
const PARTICLE_COUNT = 26;

type ConfettiParticle = {
  id: string;
  left: number;
  color: string;
  delay: number;
  duration: number;
  rotate: number;
  drift: number;
};

type ConfettiProps = {
  trigger: number;
};

export function Confetti({ trigger }: ConfettiProps) {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);

  useEffect(() => {
    if (!trigger) return;
    setParticles(Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: `${trigger}-${i}`,
      left: Math.random() * 100,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 0.2,
      duration: 0.9 + Math.random() * 0.7,
      rotate: Math.round(Math.random() * 360),
      drift: Math.round((Math.random() - 0.5) * 160),
    })));
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <div className="confetti" aria-hidden="true">
      {particles.map(p => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--drift': `${p.drift}px`,
            '--rotate': `${p.rotate}deg`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
