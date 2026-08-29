import { describe, it, expect } from 'vitest';
import { shuffle, pickRandom } from './random';

describe('shuffle', () => {
  it('returns all the same items, never fewer or more', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result).toHaveLength(5);
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not mutate the original array', () => {
    const input = [1, 2, 3];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });
});

describe('pickRandom', () => {
  it('always returns an item from the given array', () => {
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 20; i++) {
      expect(items).toContain(pickRandom(items));
    }
  });
});
