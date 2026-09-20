import { Modal } from './Modal';
import './GameCategoriesModal.css';

export type CategoryOption = { key: string; label: string };

type GameCategoriesModalProps = {
  open: boolean;
  onClose: () => void;
  options: CategoryOption[];
  selected: string[];
  onChange: (keys: string[]) => void;
};

export function GameCategoriesModal({ open, onClose, options, selected, onChange }: GameCategoriesModalProps) {
  function toggle(key: string) {
    const isOn = selected.includes(key);
    if (isOn && selected.length === 1) return;
    onChange(isOn ? selected.filter(k => k !== key) : [...selected, key]);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2>Play with</h2>
      <p className="note">Pick which decks to play the game with. Change this any time.</p>

      <ul className="category-list">
        {options.map(opt => {
          const checked = selected.includes(opt.key);
          return (
            <li key={opt.key}>
              <label className="category-option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt.key)}
                  disabled={checked && selected.length === 1}
                />
                <span>{opt.label}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="sheet-actions">
        <button type="button" className="start-btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
