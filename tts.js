import { getAccessToken } from './auth.js';
import { DEFAULT_LANGUAGE } from './languages.js';

const LS_VOICE = 'lily.elevenlabs.voice';
const LS_LANGUAGE = 'lily.language';
const CACHE_NS = 'eleven_v3';

export function getVoice() {
  return localStorage.getItem(LS_VOICE) || '';
}

export function setVoice(voiceId) {
  if (voiceId) localStorage.setItem(LS_VOICE, voiceId);
  else localStorage.removeItem(LS_VOICE);
}

export function getLanguage() {
  return localStorage.getItem(LS_LANGUAGE) || DEFAULT_LANGUAGE;
}

export function setLanguage(code) {
  localStorage.setItem(LS_LANGUAGE, code);
}

const DB_NAME = 'lily-tts';
const STORE   = 'clips';
const STORIES = 'stories';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE))   db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(STORIES)) db.createObjectStore(STORIES);
      if (!db.objectStoreNames.contains('cards'))       db.createObjectStore('cards');
      if (!db.objectStoreNames.contains('collections')) db.createObjectStore('collections');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(storeName, key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(storeName, key, value) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch {
  }
}

const cacheGet = key       => idbGet(STORE, key);
const cacheSet = (key, blob) => idbSet(STORE, key, blob);

const objectUrls = new Map();

async function apiFetch(url, opts = {}) {
  const token = await getAccessToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...opts, headers });
}

export async function listVoices() {
  const res = await apiFetch('/api/voices');
  if (!res.ok) throw new Error(await describeError(res));

  const data = await res.json();
  return data.voices || [];
}

export async function synthesize(text, voiceId) {
  if (!text)    throw new Error('Nothing to say.');
  if (!voiceId) throw new Error('No voice selected.');

  const cacheKey = `${CACHE_NS}|${voiceId}|${text}`;

  if (objectUrls.has(cacheKey)) return objectUrls.get(cacheKey);

  let blob = await cacheGet(cacheKey);

  if (!blob) {
    const res = await apiFetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId }),
    });
    if (!res.ok) throw new Error(await describeError(res));

    blob = await res.blob();
    await cacheSet(cacheKey, blob);
  }

  const url = URL.createObjectURL(blob);
  objectUrls.set(cacheKey, url);
  return url;
}

export async function isCached(text, voiceId) {
  if (!text || !voiceId) return false;
  const cacheKey = `${CACHE_NS}|${voiceId}|${text}`;
  return objectUrls.has(cacheKey) || (await cacheGet(cacheKey)) !== null;
}

export async function prefetch(text, voiceId) {
  try {
    await synthesize(text, voiceId);
  } catch {
  }
}

export async function getStory({ prompt = '', focus = '', minutes = 1, label = '', signal }) {
  const res = await apiFetch('/api/story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, focus, minutes, label, language: getLanguage() }),
    signal,
  });
  if (!res.ok) throw new Error(await describeError(res));

  const { id, characters, scenes } = await res.json();
  return { id, characters, scenes: normalizeScenes({ scenes }) };
}

export function normalizeScenes(rec) {
  if (typeof rec === 'string') return [{ text: rec, image: null }];
  if (Array.isArray(rec?.scenes)) return rec.scenes;
  if (rec?.story) return [{ text: rec.story, image: null }];
  return [];
}

export async function listStories() {
  try {
    const res = await apiFetch(`/api/stories?language=${encodeURIComponent(getLanguage())}`);
    if (!res.ok) return [];
    const { stories } = await res.json();
    return (stories || []).map(r => ({ ...r, _key: r.id }));
  } catch {
    return [];
  }
}

export async function deleteStory(id) {
  try {
    await apiFetch(`/api/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
  }
}

export async function createCollection(name) {
  const res = await apiFetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, language: getLanguage() }),
  });
  if (!res.ok) throw new Error(await describeError(res));
  const coll = await res.json();
  return { ...coll, _key: coll.id };
}

export async function listCollections() {
  try {
    const { collections } = await fetchVocabulary();
    return collections
      .map(c => ({ ...c, _key: c.id }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch {
    return [];
  }
}

export async function deleteCollection(key) {
  try {
    await apiFetch(`/api/collections/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {
  }
}

export async function generateCard(word) {
  const res = await apiFetch('/api/card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, language: getLanguage() }),
  });
  if (!res.ok) throw new Error(await describeError(res));

  const { word_fa, word_en, image } = await res.json();
  return { word_fa, word_en, imageUrl: image };
}

export async function saveCard({ word_fa, word_en, imageUrl, collectionId }) {
  const res = await apiFetch(`/api/collections/${encodeURIComponent(collectionId)}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word_fa, word_en, image: imageUrl }),
  });
  if (!res.ok) throw new Error(await describeError(res));
  const card = await res.json();
  return { ...card, _key: card.id, imageUrl: card.image };
}

export async function listCards(collectionId) {
  try {
    const { cards } = await fetchVocabulary();
    return normalizeCards(cards).filter(c => c.collectionId === collectionId);
  } catch {
    return [];
  }
}

export async function getVocabulary() {
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

function normalizeCards(cards) {
  return cards
    .map(c => ({ ...c, _key: c.id, imageUrl: c.image }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function deleteCard(key) {
  try {
    await apiFetch(`/api/cards/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {
  }
}

async function fetchVocabulary() {
  const res = await apiFetch(`/api/vocabulary?language=${encodeURIComponent(getLanguage())}`);
  if (!res.ok) throw new Error(await describeError(res));
  return res.json();
}

async function describeError(res) {
  try {
    const body = await res.json();
    if (body?.error) return body.error;
  } catch {
  }
  return `Speech request failed (${res.status}).`;
}
