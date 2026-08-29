import { useCallback, useEffect, useState } from 'react';
import { builtinWordsFor, type DeckItem } from './builtinWords';
import {
  getVocabulary, createCollection as createCollectionApi, deleteCollection as deleteCollectionApi,
  type Collection,
} from './vocabulary';

export function useVocabulary(language: string) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [customDecks, setCustomDecks] = useState<Record<string, DeckItem[]>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (): Promise<Record<string, DeckItem[]>> => {
    const { collections: fetched, cards } = await getVocabulary();
    setCollections(fetched);
    const decks: Record<string, DeckItem[]> = {};
    for (const coll of fetched) {
      decks[coll._key] = cards
        .filter(c => c.collectionId === coll._key)
        .map(c => ({ img: c.imageUrl, word: c.word_fa, key: c._key }));
    }
    setCustomDecks(decks);
    setLoading(false);
    return { ...builtinWordsFor(language), ...decks };
  }, [language]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  const categories: Record<string, DeckItem[]> = {
    ...builtinWordsFor(language),
    ...customDecks,
  };

  async function addCollection(name: string): Promise<Collection> {
    const coll = await createCollectionApi(name);
    await reload();
    return coll;
  }

  async function removeCollection(key: string): Promise<void> {
    await deleteCollectionApi(key);
    await reload();
  }

  return { categories, collections, loading, reload, addCollection, removeCollection };
}
