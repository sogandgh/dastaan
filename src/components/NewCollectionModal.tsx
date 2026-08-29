import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';

type NewCollectionModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
};

export function NewCollectionModal({ open, onClose, onCreate }: NewCollectionModalProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setStatus('');
      inputRef.current?.focus();
    }
  }, [open]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus('Give the collection a name.');
      return;
    }
    await onCreate(trimmed);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2>New collection</h2>
      <p className="note">Give it a name. You'll add words to it next.</p>

      <label className="field">
        <span className="field-label">Collection name</span>
        <input
          ref={inputRef}
          type="text"
          dir="auto"
          autoComplete="off"
          placeholder="Colors"
          maxLength={30}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
      </label>

      <p className="note error">{status}</p>

      <div className="sheet-actions">
        <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="start-btn" onClick={submit}>Create collection</button>
      </div>
    </Modal>
  );
}
