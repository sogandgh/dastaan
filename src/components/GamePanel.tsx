import { useEffect, useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { useToast } from '../context/ToastContext';
import { useVocabulary } from '../lib/useVocabulary';
import { pickRound, type GameRound } from '../lib/game';
import { pickRandom } from '../lib/random';
import { narrator } from '../lib/narrator';
import { languageOf } from '../../languages.js';
import { Confetti } from './Confetti';
import type { DeckItem } from '../lib/builtinWords';
import './GamePanel.css';

export function GamePanel() {
  const { language } = useAppShell();
  const { showToast } = useToast();
  const { categories, loading } = useVocabulary(language);
  const [round, setRound] = useState<GameRound | null>(null);
  const [wrongItems, setWrongItems] = useState<DeckItem[]>([]);
  const [shakeItem, setShakeItem] = useState<DeckItem | null>(null);
  const [correctItem, setCorrectItem] = useState<DeckItem | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  const pool = Object.values(categories).flat();
  const lang = languageOf(language);

  function onNoVoice() {
    showToast('Pick a narrator voice in Settings first.');
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
  }, [loading]);

  function resay() {
    if (!round) return;
    narrator.speakText(round.target.word, onNoVoice);
  }

  function handleChoice(item: DeckItem) {
    if (!round || celebrating || wrongItems.includes(item)) return;

    if (item === round.target) {
      setCorrectItem(item);
      setCelebrating(true);
      narrator.lipSync.celebrate();
      setConfettiTrigger(t => t + 1);
      const line = lang.celebrationLines.length ? pickRandom(lang.celebrationLines) : '';
      if (line) narrator.speakText(line, () => {});
      setTimeout(() => {
        setCelebrating(false);
        startRound(round.target.word);
      }, 1700);
    } else {
      setWrongItems(prev => [...prev, item]);
      setShakeItem(item);
      setTimeout(() => setShakeItem(null), 420);
      const line = lang.tryAgainLines.length ? pickRandom(lang.tryAgainLines) : '';
      if (line) narrator.speakText(line, () => {});
    }
  }

  function handleSkip() {
    if (!round) return;
    narrator.beginSpeaking();
    startRound(round.target.word);
  }

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
          <p>Add a few more flashcards in Learn, then come back to play.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel panel-game">
      <div className="game-head">
        <h1>Which one is it?</h1>
        <button type="button" className="resay-btn" onClick={resay} aria-label="Say the word again">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18 6a9 9 0 0 1 0 12" />
          </svg>
        </button>
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
              onClick={() => handleChoice(item)}
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

      <Confetti trigger={confettiTrigger} />
    </section>
  );
}
