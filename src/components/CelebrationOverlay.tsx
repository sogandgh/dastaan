import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './CelebrationOverlay.css';

export const CELEBRATION_DURATION_MS = 4400;

const PIECE_COUNT = 60;
const HUES = [45, 330, 275, 15, 200];
const KINDS = ['star', 'confetti', 'balloon'] as const;

type Piece = {
  id: number;
  kind: (typeof KINDS)[number];
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
    const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
    const distance = 140 + Math.random() * 380;
    const angle = kind === 'balloon'
      ? Math.PI * (1.15 + Math.random() * 0.7)
      : Math.random() * Math.PI * 2;
    return {
      id,
      kind,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      delay: Math.random() * 2.2,
      duration: 1 + Math.random() * 1.4,
      scale: 0.6 + Math.random() * 0.8,
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
