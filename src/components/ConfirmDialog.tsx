import { Modal } from './Modal';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ open, title, message, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} danger>
      <h2>{title}</h2>
      <p className="note">{message}</p>
      <div className="sheet-actions">
        <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="start-btn danger-btn" onClick={onConfirm}>Delete</button>
      </div>
    </Modal>
  );
}
