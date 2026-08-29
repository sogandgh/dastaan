import { describe, it, expect } from 'vitest';
import { pickRound } from './game';
import type { DeckItem } from './builtinWords';

const pool: DeckItem[] = [
  { img: 'a.png', word: 'الف' },
  { img: 'b.png', word: 'ب' },
  { img: 'c.png', word: 'ج' },
  { img: 'd.png', word: 'د' },
  { img: 'e.png', word: 'ه' },
];

describe('pickRound', () => {
  it('returns null when the pool has fewer than 4 items', () => {
    expect(pickRound(pool.slice(0, 3))).toBeNull();
  });

  it('returns a round with the target included among 4 unique choices', () => {
    const round = pickRound(pool);
    expect(round).not.toBeNull();
    expect(round!.choices).toHaveLength(4);
    expect(round!.choices).toContain(round!.target);
    const images = new Set(round!.choices.map(c => c.img));
    expect(images.size).toBe(4);
  });

  it('avoids picking the given word as the target when possible', () => {
    for (let i = 0; i < 30; i++) {
      const round = pickRound(pool, 'الف');
      expect(round!.target.word).not.toBe('الف');
    }
  });

  it('falls back to allowing the avoided word if nothing else fits', () => {
    const round = pickRound(pool, 'not-a-real-word-in-the-pool');
    expect(round).not.toBeNull();
  });

  it('returns null when there are not enough visually distinct choices', () => {
    const sameImagePool: DeckItem[] = [
      { img: 'same.png', word: 'one' },
      { img: 'same.png', word: 'two' },
      { img: 'same.png', word: 'three' },
      { img: 'same.png', word: 'four' },
    ];
    expect(pickRound(sameImagePool)).toBeNull();
  });
});
