import type { DeckItem } from './builtinWords';
import { shuffle, pickRandom } from './random';

export type GameRound = {
  target: DeckItem;
  choices: DeckItem[];
};

export function pickRound(pool: DeckItem[], avoidWord?: string): GameRound | null {
  if (pool.length < 4) return null;

  const candidates = avoidWord ? pool.filter(item => item.word !== avoidWord) : pool;
  const target = pickRandom(candidates.length > 0 ? candidates : pool);

  const distractorPool = pool.filter(item => item !== target && item.img !== target.img);
  if (distractorPool.length < 3) return null;
  const distractors = shuffle(distractorPool).slice(0, 3);

  return { target, choices: shuffle([target, ...distractors]) };
}
