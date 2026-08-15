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
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE))   db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(STORIES)) db.createObjectStore(STORIES);
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

/** Stories told before, newest first. Replaying one costs nothing. */
export async function listStories() {
  try {
    const db = await openDB();
    const records = await new Promise((resolve, reject) => {
      const store = db.transaction(STORIES, 'readonly').objectStore(STORIES);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });

    return records
      .map(r => (typeof r === 'string' ? { story: r, minutes: 1, savedAt: 0 } : r))
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

/** Forget one saved story. Its audio clips stay cached until the cache is cleared. */
export async function deleteStory(savedAt) {
  try {
    const db = await openDB();
    const store = db.transaction(STORIES, 'readwrite').objectStore(STORIES);
    const keys = await new Promise(res => {
      const r = store.getAllKeys();
      r.onsuccess = () => res(r.result || []);
      r.onerror   = () => res([]);
    });
    for (const k of keys) {
      const rec = await idbGet(STORIES, k);
      if (rec && typeof rec === 'object' && rec.savedAt === savedAt) {
        await new Promise(res => {
          const tx = db.transaction(STORIES, 'readwrite');
          tx.objectStore(STORIES).delete(k);
          tx.oncomplete = res;
          tx.onerror = res;
        });
        return;
      }
    }
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
