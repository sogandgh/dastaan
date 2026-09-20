import type { Collection } from '../lib/vocabulary';
import { BUILTIN_CATEGORIES, BUILTIN_CATEGORY_LABELS } from '../lib/builtinWords';
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
        {BUILTIN_CATEGORIES.map(category => (
          <button
            type="button"
            key={category}
            className={`deck-tab${currentCategory === category ? ' is-active' : ''}`}
            onClick={() => onSelect(category)}
          >
            {BUILTIN_CATEGORY_LABELS[category]}
          </button>
        ))}
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
