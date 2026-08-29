import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { generateCard, saveCard, type Card } from '../lib/vocabulary';
import './AddWordModal.css';

type PendingCard = { word_fa: string; word_en: string; imageUrl: string };

type AddWordState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'preview'; card: PendingCard }
  | { status: 'error'; message: string };

type AddWordModalProps = {
  open: boolean;
  collectionId: string | null;
  collectionName: string;
  onClose: () => void;
  onSaved: (card: Card) => void;
};

export function AddWordModal({ open, collectionId, collectionName, onClose, onSaved }: AddWordModalProps) {
  const [word, setWord] = useState('');
  const [state, setState] = useState<AddWordState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setWord('');
      setState({ status: 'idle' });
      setSaving(false);
      setSaveError(null);
      inputRef.current?.focus();
    }
  }, [open]);

  async function generate() {
    const trimmed = word.trim();
    if (!trimmed) {
      setState({ status: 'error', message: 'Type a word first.' });
      return;
    }
    setState({ status: 'generating' });
    try {
      const card = await generateCard(trimmed);
      setState({ status: 'preview', card });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  }

  function retry() {
    setState({ status: 'idle' });
    setSaveError(null);
    inputRef.current?.focus();
  }

  async function confirm() {
    if (state.status !== 'preview' || !collectionId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveCard({ ...state.card, collectionId });
      onSaved(saved);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save the card.');
    } finally {
      setSaving(false);
    }
  }

  const isPreview = state.status === 'preview';
  const isGenerating = state.status === 'generating';
  const statusMessage = saveError ? saveError
    : state.status === 'error' ? state.message
    : isGenerating ? 'Translating and drawing a picture…'
    : isPreview ? 'Good to add?'
    : '';
  const statusIsError = Boolean(saveError) || state.status === 'error';

  return (
    <Modal open={open} onClose={onClose}>
      <h2>Add a word</h2>
      <p className="note">Adding to <strong>{collectionName}</strong>. Type any word, in
        English or Farsi, and it'll be translated, illustrated, and voiced.</p>

      {!isPreview && (
        <label className="field">
          <span className="field-label">Word</span>
          <input
            ref={inputRef}
            type="text"
            dir="auto"
            autoComplete="off"
            placeholder="apple, or سیب"
            maxLength={60}
            value={word}
            onChange={e => setWord(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') generate(); }}
          />
        </label>
      )}

      {isPreview && (
        <div className="card-preview">
          <img src={state.card.imageUrl} alt="" />
          <p dir="rtl" lang="fa">{state.card.word_fa}</p>
        </div>
      )}

      <p className={`note${statusIsError ? ' error' : ''}`}>{statusMessage}</p>

      {!isPreview ? (
        <div className="sheet-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="start-btn" onClick={generate} disabled={isGenerating}>Create card</button>
        </div>
      ) : (
        <div className="sheet-actions">
          <button type="button" className="ghost-btn" onClick={retry}>Try again</button>
          <button type="button" className="start-btn" onClick={confirm} disabled={saving}>Add this card</button>
        </div>
      )}
    </Modal>
  );
}
