import { useEffect, useState, type CSSProperties } from 'react';
import './CelebrationOverlay.css';

type Decoration = 'sprinkles' | 'stars' | 'balloons';
const DECORATIONS: Decoration[] = ['sprinkles', 'stars', 'balloons'];
const PIECE_COUNT = 26;

type Piece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  scale: number;
  hue: number;
};

function randomPieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, (_, id) => ({
    id,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1.1,
    drift: (Math.random() - 0.5) * 70,
    scale: 0.7 + Math.random() * 0.9,
    hue: Math.round(Math.random() * 360),
  }));
}

type CelebrationOverlayProps = {
  show: boolean;
};

export function CelebrationOverlay({ show }: CelebrationOverlayProps) {
  const [decoration, setDecoration] = useState<Decoration>('stars');
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!show) return;
    setDecoration(DECORATIONS[Math.floor(Math.random() * DECORATIONS.length)]);
    setPieces(randomPieces());
  }, [show]);

  if (!show) return null;

  return (
    <div className="celebration-overlay" aria-hidden="true">
      <div className="celebration-glow" />
      <div className={`celebration-pieces celebration-pieces--${decoration}`}>
        {pieces.map(p => (
          <span
            key={p.id}
            className="celebration-piece"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--drift': `${p.drift}px`,
              '--scale': p.scale,
              '--hue': p.hue,
            } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
