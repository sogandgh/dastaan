import { apiFetch, describeError } from './api';
import { getLanguage } from './preferences';

export type Collection = {
  id: string;
  name: string;
  createdAt?: number;
  _key: string;
};

export type Card = {
  id: string;
  word_fa: string;
  word_en: string;
  image: string;
  imageUrl: string;
  collectionId: string;
  createdAt?: number;
  _key: string;
};

async function fetchVocabulary(): Promise<{ collections: Collection[]; cards: Card[] }> {
  const res = await apiFetch(`/api/vocabulary?language=${encodeURIComponent(getLanguage())}`);
  if (!res.ok) throw new Error(await describeError(res));
  return res.json();
}

function normalizeCards(cards: Card[]): Card[] {
  return cards
    .map(c => ({ ...c, _key: c.id, imageUrl: c.image }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function getVocabulary(): Promise<{ collections: Collection[]; cards: Card[] }> {
  try {
    const { collections, cards } = await fetchVocabulary();
    return {
      collections: collections
        .map(c => ({ ...c, _key: c.id }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      cards: normalizeCards(cards),
    };
  } catch {
    return { collections: [], cards: [] };
  }
}

export async function createCollection(name: string): Promise<Collection> {
  const res = await apiFetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, language: getLanguage() }),
  });
  if (!res.ok) throw new Error(await describeError(res));
  const coll = await res.json();
  return { ...coll, _key: coll.id };
}

export async function deleteCollection(key: string): Promise<void> {
  try {
    await apiFetch(`/api/collections/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {
  }
}

export async function generateCard(word: string): Promise<{ word_fa: string; word_en: string; imageUrl: string }> {
  const res = await apiFetch('/api/card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, language: getLanguage() }),
  });
  if (!res.ok) throw new Error(await describeError(res));

  const { word_fa, word_en, image } = await res.json();
  return { word_fa, word_en, imageUrl: image };
}

export async function saveCard(card: { word_fa: string; word_en: string; imageUrl: string; collectionId: string }): Promise<Card> {
  const res = await apiFetch(`/api/collections/${encodeURIComponent(card.collectionId)}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word_fa: card.word_fa, word_en: card.word_en, image: card.imageUrl }),
  });
  if (!res.ok) throw new Error(await describeError(res));
  const saved = await res.json();
  return { ...saved, _key: saved.id, imageUrl: saved.image };
}

export async function deleteCard(key: string): Promise<void> {
  try {
    await apiFetch(`/api/cards/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {
  }
}
