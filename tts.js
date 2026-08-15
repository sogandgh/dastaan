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
const DB_NAME     = 'bluey-tts';
const STORE       = 'clips';
const STORIES     = 'stories';
const CARDS       = 'cards';
const COLLECTIONS = 'collections';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE))       db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(STORIES))     db.createObjectStore(STORIES);
      if (!db.objectStoreNames.contains(CARDS))       db.createObjectStore(CARDS);
      if (!db.objectStoreNames.contains(COLLECTIONS)) db.createObjectStore(COLLECTIONS);
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
/**
 * Ask for a story. The same request always returns the same story: small
 * children want *that* story again, not a new one, and a cached story also hits
 * the cached audio, so a repeat costs nothing and plays instantly.
 */
export async function getStory({ prompt = '', focus = '', minutes = 1, label = '' }) {
  const key = [
    minutes,
    focus,
    prompt.trim().toLowerCase().replace(/\s+/g, ' '),
  ].join('|');

  const cached = await idbGet(STORIES, key);
  if (cached) {
    // Older builds stored the bare text; keep those readable.
    const story = typeof cached === 'string' ? cached : cached.story;
    return { story, fromCache: true };
  }

  const res = await fetch('/api/story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, focus, minutes }),
  });
  if (!res.ok) throw new Error(await describeError(res));

  const { story } = await res.json();
  await idbSet(STORIES, key, {
    story,
    label: label || prompt.trim() || 'A story',
    minutes,
    savedAt: Date.now(),
  });
  return { story, fromCache: false };
}

/**
 * Stories told before, newest first. Replaying one costs nothing.
 * Each record carries its real IndexedDB key as `_key`, so deleteStory can
 * remove it directly rather than matching by value — a value like savedAt
 * can't identify a record that never had one (see deleteStory below).
 */
export async function listStories() {
  try {
    const db = await openDB();
    const store = db.transaction(STORIES, 'readonly').objectStore(STORIES);

    // getAll() and getAllKeys() are guaranteed to return in the same
    // (primary-key) order, so they can be zipped positionally.
    const [values, keys] = await Promise.all([
      new Promise((resolve, reject) => {
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror   = () => reject(r.error);
      }),
      new Promise((resolve, reject) => {
        const r = store.getAllKeys();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror   = () => reject(r.error);
      }),
    ]);

    return values
      .map((r, i) => {
        const rec = typeof r === 'string' ? { story: r, minutes: 1, savedAt: 0 } : r;
        return { ...rec, _key: keys[i] };
      })
      .filter(r => r && r.story)
      // Records saved before labels existed still deserve a name: use the
      // story's opening words rather than calling everything "A story".
      .map(r => ({ ...r, label: r.label || openingWords(r.story) }))
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  } catch {
    return [];
  }
}

function openingWords(story) {
  const words = story.trim().split(/\s+/).slice(0, 5).join(' ');
  return words.length < story.trim().length ? `${words}…` : words;
}

/**
 * Forget one saved story, given the `_key` from listStories(). Its audio
 * clips stay cached until the cache is cleared.
 */
export async function deleteStory(key) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORIES, 'readwrite');
      tx.objectStore(STORIES).delete(key);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch {
    /* best effort */
  }
}

// ── Custom collections ──────────────────────────────────────────
/** A named deck the parent creates, e.g. "Colors" or "Family". Starts empty. */
export async function createCollection(name) {
  const record = { name: name.trim(), createdAt: Date.now() };
  const key = `coll-${record.createdAt}-${Math.random().toString(36).slice(2, 7)}`;
  await idbSet(COLLECTIONS, key, record);
  return { ...record, _key: key };
}

/** Collections in the order they were created. */
export async function listCollections() {
  try {
    const db = await openDB();
    const store = db.transaction(COLLECTIONS, 'readonly').objectStore(COLLECTIONS);

    const [values, keys] = await Promise.all([getAllFrom(store), getAllKeysFrom(store)]);

    return values
      .map((r, i) => ({ ...r, _key: keys[i] }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch {
    return [];
  }
}

/** Delete a collection and every card in it. */
export async function deleteCollection(key) {
  try {
    const cards = await listCards(key);
    for (const c of cards) await deleteCard(c._key);

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(COLLECTIONS, 'readwrite');
      tx.objectStore(COLLECTIONS).delete(key);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
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
  const imageBlob = await (await fetch(image)).blob();   // data: URL -> Blob
  return { word_fa, word_en, imageBlob, imageUrl: URL.createObjectURL(imageBlob) };
}

/** Persist a card a parent has confirmed, into the given collection. */
export async function saveCard({ word_fa, word_en, imageBlob, collectionId }) {
  const record = { word_fa, word_en, imageBlob, collectionId, createdAt: Date.now() };
  const key = `card-${record.createdAt}-${Math.random().toString(36).slice(2, 7)}`;
  await idbSet(CARDS, key, record);
  return { ...record, _key: key, imageUrl: URL.createObjectURL(imageBlob) };
}

/** Cards in one collection, in the order they were added. */
export async function listCards(collectionId) {
  try {
    const db = await openDB();
    const store = db.transaction(CARDS, 'readonly').objectStore(CARDS);

    const [values, keys] = await Promise.all([getAllFrom(store), getAllKeysFrom(store)]);

    return values
      .map((r, i) => ({ ...r, _key: keys[i], imageUrl: URL.createObjectURL(r.imageBlob) }))
      .filter(r => r.collectionId === collectionId)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch {
    return [];
  }
}

function getAllFrom(store) {
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror   = () => reject(r.error);
  });
}
function getAllKeysFrom(store) {
  return new Promise((resolve, reject) => {
    const r = store.getAllKeys();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror   = () => reject(r.error);
  });
}

/** Forget one custom card. */
export async function deleteCard(key) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CARDS, 'readwrite');
      tx.objectStore(CARDS).delete(key);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch {
    /* best effort */
  }
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
