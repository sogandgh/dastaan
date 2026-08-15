/**
 * tts.js — ElevenLabs text-to-speech for Bluey
 *
 * Replaces the pre-recorded clips this app used to ship with. Every word is
 * synthesised on demand, then cached in IndexedDB so the same word is only
 * ever paid for once per browser.
 *
 * This module never touches an API key. It calls /api/tts and /api/voices on
 * the local server (server.js), which holds the key in ELEVENLABS_API_KEY and
 * forwards the request to ElevenLabs. The model and voice settings therefore
 * live in server.js, not here.
 */

const LS_VOICE = 'bluey.elevenlabs.voice';

// Cache keys are versioned by model so changing the model invalidates old clips.
const CACHE_NS = 'eleven_v3';

// ── Voice preference (not secret — safe in localStorage) ────────
export function getVoice() {
  return localStorage.getItem(LS_VOICE) || '';
}

export function setVoice(voiceId) {
  if (voiceId) localStorage.setItem(LS_VOICE, voiceId);
  else localStorage.removeItem(LS_VOICE);
}

// ── IndexedDB clip cache ────────────────────────────────────────
const DB_NAME = 'bluey-tts';
const STORE   = 'clips';
const STORIES = 'stories';
// 'cards', 'collections', and (as of this file) 'stories' are no longer
// written to — that data now lives on the server, shared across devices —
// but the object stores are left in place rather than migrated away, since
// some browsers may already have them and there is nothing left to gain by
// deleting empty stores. Old browser-local story history simply stops
// showing up; nothing reads this store anymore.
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
    return null; // a broken cache must never stop the app from talking
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
    /* cache writes are best effort */
  }
}

const cacheGet = key       => idbGet(STORE, key);
const cacheSet = (key, blob) => idbSet(STORE, key, blob);

export async function clearCache() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
}

// Blob URLs are kept alive for the life of the page so replays are instant.
const objectUrls = new Map();

// ── API (via the local server, which holds the key) ─────────────
export async function listVoices() {
  const res = await fetch('/api/voices');
  if (!res.ok) throw new Error(await describeError(res));

  const data = await res.json();
  return data.voices || [];
}

/**
 * Synthesise `text` in `voiceId` and resolve to a playable object URL.
 * Cached clips resolve without touching the network (and without spending credits).
 */
export async function synthesize(text, voiceId) {
  if (!text)    throw new Error('Nothing to say.');
  if (!voiceId) throw new Error('No voice selected.');

  const cacheKey = `${CACHE_NS}|${voiceId}|${text}`;

  if (objectUrls.has(cacheKey)) return objectUrls.get(cacheKey);

  let blob = await cacheGet(cacheKey);

  if (!blob) {
    const res = await fetch('/api/tts', {
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

/** True when this exact clip is already cached, i.e. free and instant to play. */
export async function isCached(text, voiceId) {
  if (!text || !voiceId) return false;
  const cacheKey = `${CACHE_NS}|${voiceId}|${text}`;
  return objectUrls.has(cacheKey) || (await cacheGet(cacheKey)) !== null;
}

/** Warm the cache without playing, so the next tap is instant. */
export async function prefetch(text, voiceId) {
  try {
    await synthesize(text, voiceId);
  } catch {
    /* prefetch failures are silent by design */
  }
}

// ── Stories ─────────────────────────────────────────────────────
// Shared on the server now, not per-browser IndexedDB — a story generated
// on one phone shows up in "stories you've made" on every other device
// too, the same way collections/cards already do. The server itself
// recognises a repeat of the same focus/prompt/length and returns the
// existing story instead of writing a new one, so replaying (from
// history) or re-asking for the same thing (from setup) both resolve
// instantly and never regenerate.
/** Ask for a story. `signal` lets the in-flight request be cancelled. */
export async function getStory({ prompt = '', focus = '', minutes = 1, label = '', signal }) {
  const res = await fetch('/api/story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, focus, minutes, label }),
    signal,
  });
  if (!res.ok) throw new Error(await describeError(res));

  const { id, characters, scenes } = await res.json();
  return { id, characters, scenes: normalizeScenes({ scenes }) };
}

/**
 * Every story from before this feature has `{ story: "..." }` — one flat
 * string, no pictures — instead of `{ scenes: [...] }`. Both shapes end up
 * looking the same to callers: a list of `{ text, image }` scenes, `image`
 * just null for the old ones (so playback still works, minus the slideshow).
 */
export function normalizeScenes(rec) {
  if (typeof rec === 'string') return [{ text: rec, image: null }];
  if (Array.isArray(rec?.scenes)) return rec.scenes;
  if (rec?.story) return [{ text: rec.story, image: null }];
  return [];
}

/** Stories told before, newest first (server already sorts them). Replaying
 *  one costs nothing. Each record's real id is exposed as `_key`, matching
 *  the shape this used to have as an IndexedDB key — deleteStory below and
 *  its caller in app.js only ever pass that value back through. */
export async function listStories() {
  try {
    const res = await fetch('/api/stories');
    if (!res.ok) return [];
    const { stories } = await res.json();
    return (stories || []).map(r => ({ ...r, _key: r.id }));
  } catch {
    return [];
  }
}

/** Forget one saved story, given the `_key` (id) from listStories(). */
export async function deleteStory(id) {
  try {
    await fetch(`/api/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    /* best effort */
  }
}

// ── Custom collections ──────────────────────────────────────────
/** A named deck the parent creates, e.g. "Colors" or "Family". Starts empty. */
// Collections and cards live on the server now, not in this browser's
// IndexedDB — every device that opens the app sees the same family
// vocabulary. (Stories are shared the same way, above. Only word audio
// clips stay local — a per-device cache, not something worth syncing.)
export async function createCollection(name) {
  const res = await fetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await describeError(res));
  const coll = await res.json();
  return { ...coll, _key: coll.id };
}

/** Collections in the order they were created. */
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

/** Delete a collection and every card in it. */
export async function deleteCollection(key) {
  try {
    await fetch(`/api/collections/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {
    /* best effort */
  }
}

// ── Custom flashcards ───────────────────────────────────────────
/**
 * Ask the server to translate a word and draw a picture for it. Returns the
 * result for the parent to preview — nothing is saved until saveCard() is
 * called, so a card the parent doesn't like never touches storage.
 */
export async function generateCard(word) {
  const res = await fetch('/api/card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word }),
  });
  if (!res.ok) throw new Error(await describeError(res));

  const { word_fa, word_en, image } = await res.json();
  return { word_fa, word_en, imageUrl: image };   // image is a data: URL, usable directly as <img src>
}

/** Persist a card a parent has confirmed, into the given collection. */
export async function saveCard({ word_fa, word_en, imageUrl, collectionId }) {
  const res = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word_fa, word_en, image: imageUrl }),
  });
  if (!res.ok) throw new Error(await describeError(res));
  const card = await res.json();
  return { ...card, _key: card.id, imageUrl: card.image };
}

/** Cards in one collection, in the order they were added. */
export async function listCards(collectionId) {
  try {
    const { cards } = await fetchVocabulary();
    return normalizeCards(cards).filter(c => c.collectionId === collectionId);
  } catch {
    return [];
  }
}

/**
 * Every collection and every card, in one request — used at startup so
 * populating N collections costs one round trip, not N+1.
 */
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

/** Forget one custom card. */
export async function deleteCard(key) {
  try {
    await fetch(`/api/cards/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {
    /* best effort */
  }
}

async function fetchVocabulary() {
  const res = await fetch('/api/vocabulary');
  if (!res.ok) throw new Error(await describeError(res));
  return res.json();
}

/** The server already turns upstream failures into a readable `error` string. */
async function describeError(res) {
  try {
    const body = await res.json();
    if (body?.error) return body.error;
  } catch {
    /* non-JSON error body */
  }
  return `Speech request failed (${res.status}).`;
}
