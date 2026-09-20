import { useEffect, useState, type MouseEvent } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { useToast } from '../context/ToastContext';
import { useVocabulary } from '../lib/useVocabulary';
import { pickRound, type GameRound } from '../lib/game';
import { narrator } from '../lib/narrator';
import { getGameCategories, setGameCategories } from '../lib/preferences';
import { languageOf } from '../../languages.js';
import { CelebrationOverlay, CELEBRATION_DURATION_MS, type CelebrationOrigin } from './CelebrationOverlay';
import { GameCategoriesModal, type CategoryOption } from './GameCategoriesModal';
import { BUILTIN_CATEGORY_LABELS, isBuiltinCategory, type DeckItem } from '../lib/builtinWords';
import './GamePanel.css';

const CENTER_ORIGIN: CelebrationOrigin = { x: 50, y: 50 };

export function GamePanel() {
  const { language } = useAppShell();
  const { showToast } = useToast();
  const { categories, collections, loading } = useVocabulary(language);
  const [round, setRound] = useState<GameRound | null>(null);
  const [wrongItems, setWrongItems] = useState<DeckItem[]>([]);
  const [shakeItem, setShakeItem] = useState<DeckItem | null>(null);
  const [correctItem, setCorrectItem] = useState<DeckItem | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationOrigin, setCelebrationOrigin] = useState<CelebrationOrigin>(CENTER_ORIGIN);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => getGameCategories() ?? []);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const allKeys = Object.keys(categories);
  const validSelected = selectedCategories.filter(key => allKeys.includes(key));
  const effectiveSelected = validSelected.length > 0 ? validSelected : allKeys;
  const effectiveSelectedSignature = effectiveSelected.join(',');

  const categoryOptions: CategoryOption[] = allKeys.map(key => ({
    key,
    label: isBuiltinCategory(key) ? BUILTIN_CATEGORY_LABELS[key] : collections.find(c => c._key === key)?.name ?? key,
  }));

  const pool = effectiveSelected.flatMap(key => categories[key] ?? []);
  const lang = languageOf(language);

  function onNoVoice() {
    showToast('Pick a narrator voice in Settings first.');
  }

  function handleCategoriesChange(keys: string[]) {
    setSelectedCategories(keys);
    setGameCategories(keys);
  }

  function startRound(avoidWord?: string) {
    const next = pickRound(pool, avoidWord);
    setRound(next);
    setWrongItems([]);
    setCorrectItem(null);
    if (!next) return;
    narrator.lipSync.announce();
    setTimeout(() => narrator.speakText(next.target.word, onNoVoice), 250);
  }

  useEffect(() => {
    if (!loading) startRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, effectiveSelectedSignature]);

  useEffect(() => {
    narrator.prefetchLine(lang.celebrationLine);
    narrator.prefetchLine(lang.tryAgainLine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  function resay() {
    if (!round) return;
    narrator.speakText(round.target.word, onNoVoice);
  }

  function handleChoice(item: DeckItem, event: MouseEvent<HTMLButtonElement>) {
    if (!round || celebrating || wrongItems.includes(item)) return;

    if (item === round.target) {
      const rect = event.currentTarget.getBoundingClientRect();
      setCelebrationOrigin({
        x: ((rect.left + rect.width / 2) / window.innerWidth) * 100,
        y: ((rect.top + rect.height / 2) / window.innerHeight) * 100,
      });
      setCorrectItem(item);
      setCelebrating(true);
      narrator.lipSync.celebrate();
      if (lang.celebrationLine) narrator.speakText(lang.celebrationLine, () => {});
      setTimeout(() => {
        setCelebrating(false);
        startRound(round.target.word);
      }, CELEBRATION_DURATION_MS);
    } else {
      setWrongItems(prev => [...prev, item]);
      setShakeItem(item);
      setTimeout(() => setShakeItem(null), 420);
      if (lang.tryAgainLine) narrator.speakText(lang.tryAgainLine, () => {});
    }
  }

  function handleSkip() {
    if (!round) return;
    narrator.beginSpeaking();
    startRound(round.target.word);
  }

  const categoriesModal = (
    <GameCategoriesModal
      open={categoriesOpen}
      onClose={() => setCategoriesOpen(false)}
      options={categoryOptions}
      selected={effectiveSelected}
      onChange={handleCategoriesChange}
    />
  );

  const categoriesButton = (
    <button type="button" className="game-icon-btn" onClick={() => setCategoriesOpen(true)} aria-label="Choose which decks to play with">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    </button>
  );

  if (loading) {
    return (
      <section className="panel panel-game">
        <div className="game-head"><h1>Loading your flashcards…</h1></div>
      </section>
    );
  }

  if (!round) {
    return (
      <section className="panel panel-game">
        <div className="game-head">
          <h1>Not quite enough cards yet</h1>
          {categoriesButton}
        </div>
        <p>Add a few more flashcards in Learn, or pick more decks to play with, then come back to play.</p>
        {categoriesModal}
      </section>
    );
  }

  return (
    <section className="panel panel-game">
      <div className="game-head">
        <h1>Which one is it?</h1>
        <div className="game-head-actions">
          {categoriesButton}
          <button type="button" className="game-icon-btn" onClick={resay} aria-label="Say the word again">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
          </button>
        </div>
      </div>

      <div className="game-grid">
        {round.choices.map((item, i) => {
          const isWrong = wrongItems.includes(item);
          const isShaking = shakeItem === item;
          const isCorrect = correctItem === item;
          return (
            <button
              type="button"
              key={i}
              className={`game-tile${isWrong ? ' is-wrong' : ''}${isShaking ? ' is-shaking' : ''}${isCorrect ? ' is-correct' : ''}`}
              onClick={e => handleChoice(item, e)}
              disabled={isWrong || celebrating}
              aria-label="Pick this picture"
            >
              <img src={item.img} alt="" />
              {isCorrect && <span className="game-tile-check">✓</span>}
            </button>
          );
        })}
      </div>

      <button type="button" className="ghost-btn game-skip" onClick={handleSkip} disabled={celebrating}>
        Skip, next word
      </button>

      <CelebrationOverlay
        show={celebrating}
        origin={celebrationOrigin}
        line={lang.celebrationLine}
        dir={lang.dir}
        font={lang.font}
      />
      {categoriesModal}
    </section>
  );
}
