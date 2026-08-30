import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './CelebrationOverlay.css';

const PIECE_COUNT = 22;
const HUES = [45, 330, 275, 15, 200];

type Piece = {
  id: number;
  kind: 'star' | 'confetti';
  dx: number;
  dy: number;
  delay: number;
  duration: number;
  scale: number;
  hue: number;
  spin: number;
};

function randomPieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, (_, id) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 170;
    return {
      id,
      kind: Math.random() < 0.5 ? 'star' : 'confetti',
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      delay: Math.random() * 0.15,
      duration: 0.7 + Math.random() * 0.5,
      scale: 0.6 + Math.random() * 0.7,
      hue: HUES[Math.floor(Math.random() * HUES.length)] + (Math.random() * 30 - 15),
      spin: Math.random() * 480 - 240,
    };
  });
}

export type CelebrationOrigin = { x: number; y: number };

type CelebrationOverlayProps = {
  show: boolean;
  origin: CelebrationOrigin;
  line: string;
  dir: 'ltr' | 'rtl';
  font: string;
};

export function CelebrationOverlay({ show, origin, line, dir, font }: CelebrationOverlayProps) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!show) return;
    setPieces(randomPieces());
  }, [show]);

  if (!show) return null;

  return createPortal(
    <div
      className="celebration-overlay"
      aria-hidden="true"
      style={{ '--origin-x': `${origin.x}%`, '--origin-y': `${origin.y}%` } as CSSProperties}
    >
      <div className="celebration-pieces">
        {pieces.map(p => (
          <span
            key={p.id}
            className={`celebration-piece celebration-piece--${p.kind}`}
            style={{
              left: 'var(--origin-x)',
              top: 'var(--origin-y)',
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--scale': p.scale,
              '--hue': p.hue,
              '--spin': `${p.spin}deg`,
            } as CSSProperties}
          />
        ))}
      </div>
      {line && (
        <div className="celebration-text" dir={dir} style={{ fontFamily: font }}>
          {line}
        </div>
      )}
    </div>,
    document.body,
  );
}
