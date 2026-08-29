import type { DeckItem } from '../lib/builtinWords';
import './Flashcard.css';

type FlashcardProps = {
  items: DeckItem[];
  currentIndex: number;
  isCustomDeck: boolean;
  onNavigate: (direction: 1 | -1) => void;
  onSay: () => void;
  onDelete: () => void;
  onAddWord: () => void;
};

export function Flashcard({ items, currentIndex, isCustomDeck, onNavigate, onSay, onDelete, onAddWord }: FlashcardProps) {
  if (items.length === 0) {
    return (
      <div className="card-row">
        <div className="card-slot">
          <div className="card card-empty" onClick={onAddWord} role="button" tabIndex={0}>
            <span className="card-empty-icon">＋</span>
            <p>Add your first word</p>
            <p className="card-empty-sub">Any word, in English or Farsi</p>
          </div>
        </div>
      </div>
    );
  }

  const item = items[currentIndex];

  return (
    <>
      <div className="card-row">
        <div className="card-slot">
          <div className="card pop" key={currentIndex} onClick={onSay} role="button" tabIndex={0} aria-label="Hear this word">
            {isCustomDeck && (
              <button type="button" className="card-del" onClick={e => { e.stopPropagation(); onDelete(); }} aria-label="Remove this word">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            )}
            <div className="card-art">
              <img src={item.img} alt="" />
            </div>
            <p className="card-word" dir="rtl" lang="fa">{item.word}</p>
            <div className="card-foot">
              <span className="counter">{currentIndex + 1} / {items.length}</span>
              <div className="dots">
                {items.map((_, i) => (
                  <div key={i} className={`dot${i === currentIndex ? ' active' : ''}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {isCustomDeck && (
          <button type="button" className="card-add-outside" onClick={onAddWord} aria-label="Add another word">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        )}
      </div>

      <div className="deck-nav">
        <button type="button" className="nav-btn" onClick={() => onNavigate(-1)} aria-label="Previous">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button type="button" className="say-btn" onClick={onSay}>Say it</button>
        <button type="button" className="nav-btn" onClick={() => onNavigate(1)} aria-label="Next">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </>
  );
}
