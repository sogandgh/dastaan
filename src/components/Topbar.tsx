import type { AppMode } from '../lib/mode';
import './Topbar.css';

type TopbarProps = {
  mode: AppMode;
  nativeLanguageName: string;
  onModeChange: (mode: AppMode) => void;
  onBack: () => void;
  onOpenSettings: () => void;
};

export function Topbar({ mode, nativeLanguageName, onModeChange, onBack, onOpenSettings }: TopbarProps) {
  const isLearn = mode === 'learn';
  const isStory = mode === 'setup' || mode === 'play';
  const isTalk = mode === 'talk';
  const isGame = mode === 'game';

  return (
    <header className="topbar">
      <button type="button" className="icon-btn back-btn" onClick={onBack} aria-label="Back to story setup">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <div className="brand">
        <span className="brand-mark">Dastaan</span>
        <strong className="brand-en">{nativeLanguageName}</strong>
      </div>

      <div className="modes" role="tablist" aria-label="Mode">
        <button
          type="button"
          className={`mode-tab${isLearn ? ' is-active' : ''}`}
          role="tab"
          aria-selected={isLearn}
          onClick={() => onModeChange('learn')}
        >
          Learn
        </button>
        <button
          type="button"
          className={`mode-tab${isStory ? ' is-active' : ''}`}
          role="tab"
          aria-selected={isStory}
          onClick={() => onModeChange('setup')}
        >
          Story
        </button>
        <button
          type="button"
          className={`mode-tab${isTalk ? ' is-active' : ''}`}
          role="tab"
          aria-selected={isTalk}
          onClick={() => onModeChange('talk')}
        >
          Talk
        </button>
        <button
          type="button"
          className={`mode-tab${isGame ? ' is-active' : ''}`}
          role="tab"
          aria-selected={isGame}
          onClick={() => onModeChange('game')}
        >
          Game
        </button>
      </div>

      <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Voice settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
    </header>
  );
}
