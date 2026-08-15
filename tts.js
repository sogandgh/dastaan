/**
 * tts.js — ElevenLabs text-to-speech for Bluey
 *
 * Replaces the pre-recorded clips this app used to ship with. Every word is
 * synthesised on demand, then cached in IndexedDB so the same word is only
 * ever paid for once per browser.
 *
 * Persian (fas) is only supported by the eleven_v3 model — multilingual_v2
 * and the flash/turbo models do not list it, so the model is not configurable.
 *
 * The API key is supplied by the user at runtime and kept in localStorage.
 * It is deliberately never read from a file in this repo.
 */

const API_ROOT  = 'https://api.elevenlabs.io';
const MODEL_ID  = 'eleven_v3';
const OUT_FMT   = 'mp3_44100_128';

const LS_KEY    = 'bluey.elevenlabs.apiKey';
const LS_VOICES = 'bluey.elevenlabs.voices';

// Slightly slowed down: these are words a toddler is hearing for the first time.
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, speed: 0.9 };

// ── Credential + voice storage ──────────────────────────────────
export function getApiKey() {
  return localStorage.getItem(LS_KEY) || '';
}

export function setApiKey(key) {
  const trimmed = (key || '').trim();
  if (trimmed) localStorage.setItem(LS_KEY, trimmed);
  else localStorage.removeItem(LS_KEY);
}

export function getVoices() {
  try {
    return JSON.parse(localStorage.getItem(LS_VOICES)) || {};
  } catch {
    return {};
  }
}

export function setVoice(character, voiceId) {
  const voices = getVoices();
  voices[character] = voiceId;
  localStorage.setItem(LS_VOICES, JSON.stringify(voices));
}

// ── IndexedDB clip cache ────────────────────────────────────────
const DB_NAME = 'bluey-tts';
const STORE   = 'clips';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return dbPromise;
}

async function cacheGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return null; // a broken cache must never stop the app from talking
  }
}

async function cacheSet(key, blob) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch {
    /* cache writes are best effort */
  }
}

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

// ── API ─────────────────────────────────────────────────────────
export async function listVoices() {
  const key = getApiKey();
  if (!key) throw new Error('No API key set.');

  const res = await fetch(`${API_ROOT}/v2/voices?page_size=100`, {
    headers: { 'xi-api-key': key },
  });
  if (!res.ok) throw new Error(await describeError(res));

  const data = await res.json();
  return (data.voices || []).map(v => ({
    voice_id: v.voice_id,
    name:     v.name,
    labels:   v.labels || {},
  }));
}

/**
 * Synthesise `text` in `voiceId` and resolve to a playable object URL.
 * Cached clips resolve without touching the network (and without spending credits).
 */
export async function synthesize(text, voiceId) {
  if (!text)    throw new Error('Nothing to say.');
  if (!voiceId) throw new Error('No voice selected.');

  const cacheKey = `${MODEL_ID}|${voiceId}|${text}`;

  if (objectUrls.has(cacheKey)) return objectUrls.get(cacheKey);

  let blob = await cacheGet(cacheKey);

  if (!blob) {
    const key = getApiKey();
    if (!key) throw new Error('No API key set.');

    const res = await fetch(
      `${API_ROOT}/v1/text-to-speech/${voiceId}?output_format=${OUT_FMT}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: VOICE_SETTINGS,
        }),
      }
    );
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
  const cacheKey = `${MODEL_ID}|${voiceId}|${text}`;
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

async function describeError(res) {
  if (res.status === 401) return 'That API key was rejected. Check it in Settings.';
  if (res.status === 429) return 'ElevenLabs rate limit or quota reached.';

  let detail = '';
  try {
    const body = await res.json();
    detail = body?.detail?.message || body?.detail?.status || '';
  } catch {
    /* non-JSON error body */
  }
  return detail || `ElevenLabs request failed (${res.status}).`;
}
