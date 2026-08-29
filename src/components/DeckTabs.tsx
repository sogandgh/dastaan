import type { Collection } from '../lib/vocabulary';
import './DeckTabs.css';

type DeckTabsProps = {
  currentCategory: string;
  collections: Collection[];
  onSelect: (category: string) => void;
  onDeleteCollection: (collection: Collection) => void;
  onAddCollection: () => void;
};

export function DeckTabs({ currentCategory, collections, onSelect, onDeleteCollection, onAddCollection }: DeckTabsProps) {
  return (
    <div className="deck-row">
      <div className="deck-tabs" role="tablist" aria-label="Deck">
        <button
          type="button"
          className={`deck-tab${currentCategory === 'animals' ? ' is-active' : ''}`}
          onClick={() => onSelect('animals')}
        >
          Animals
        </button>
        <button
          type="button"
          className={`deck-tab${currentCategory === 'face' ? ' is-active' : ''}`}
          onClick={() => onSelect('face')}
        >
          Face &amp; body
        </button>
        {collections.map(coll => (
          <button
            type="button"
            key={coll._key}
            className={`deck-tab deck-tab-custom${currentCategory === coll._key ? ' is-active' : ''}`}
            onClick={() => onSelect(coll._key)}
          >
            <span className="deck-tab-label">{coll.name}</span>
            <span
              className="deck-tab-del"
              title={`Remove "${coll.name}"`}
              onClick={e => { e.stopPropagation(); onDeleteCollection(coll); }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="icon-btn add-word-btn" onClick={onAddCollection} aria-label="Add a collection" title="Add a collection">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
