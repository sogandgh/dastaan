import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  danger?: boolean;
  children: ReactNode;
};

export function Modal({ open, onClose, danger, children }: ModalProps) {
  const downOnBackdrop = useRef(false);

  if (!open) return null;

  return createPortal(
    <div
      className="sheet-overlay"
      onPointerDown={e => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={e => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); }}
    >
      <div className={`sheet${danger ? ' sheet-danger' : ''}`}>{children}</div>
    </div>,
    document.body,
  );
}
