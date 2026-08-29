import './CelebrationOverlay.css';

type CelebrationOverlayProps = {
  show: boolean;
};

export function CelebrationOverlay({ show }: CelebrationOverlayProps) {
  if (!show) return null;
  return <div className="celebration-overlay" aria-hidden="true" />;
}
