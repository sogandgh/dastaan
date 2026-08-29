import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useVocabulary } from './useVocabulary';
import { getVocabulary } from './vocabulary';

vi.mock('./vocabulary', () => ({
  getVocabulary: vi.fn(),
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getVocabulary).mockReset();
});

describe('useVocabulary', () => {
  it('merges builtin categories with fetched custom decks', async () => {
    vi.mocked(getVocabulary).mockResolvedValue({
      collections: [{ id: 'c1', _key: 'c1', name: 'Colors' }],
      cards: [{ id: 'card1', _key: 'card1', word_fa: 'قرمز', word_en: 'red', image: 'red.png', imageUrl: 'red.png', collectionId: 'c1' }],
    });

    const { result } = renderHook(() => useVocabulary('fa'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categories.animals.length).toBeGreaterThan(0);
    expect(result.current.categories.c1).toEqual([{ img: 'red.png', word: 'قرمز', key: 'card1' }]);
  });

  it('reload resolves with the freshly merged categories, not stale state', async () => {
    vi.mocked(getVocabulary)
      .mockResolvedValueOnce({ collections: [{ id: 'c1', _key: 'c1', name: 'Colors' }], cards: [] })
      .mockResolvedValueOnce({
        collections: [{ id: 'c1', _key: 'c1', name: 'Colors' }],
        cards: [{ id: 'card1', _key: 'card1', word_fa: 'قرمز', word_en: 'red', image: 'red.png', imageUrl: 'red.png', collectionId: 'c1' }],
      });

    const { result } = renderHook(() => useVocabulary('fa'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories.c1).toEqual([]);

    let fresh: Record<string, unknown> = {};
    await act(async () => {
      fresh = await result.current.reload();
    });

    expect(fresh.c1).toEqual([{ img: 'red.png', word: 'قرمز', key: 'card1' }]);
  });
});
