import { apiFetch, describeError } from './api';

const CACHE_NS = 'eleven_v3';
const DB_NAME = 'lily-tts';
const STORE = 'clips';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains('stories')) db.createObjectStore('stories');
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards');
      if (!db.objectStoreNames.contains('collections')) db.createObjectStore('collections');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(storeName: string, key: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(storeName: string, key: string, value: Blob): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
  }
}

const cacheGet = (key: string) => idbGet(STORE, key);
const cacheSet = (key: string, blob: Blob) => idbSet(STORE, key, blob);

const objectUrls = new Map<string, string>();

export async function synthesize(text: string, voiceId: string): Promise<string> {
  if (!text) throw new Error('Nothing to say.');
  if (!voiceId) throw new Error('No voice selected.');

  const cacheKey = `${CACHE_NS}|${voiceId}|${text}`;

  if (objectUrls.has(cacheKey)) return objectUrls.get(cacheKey)!;

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

export async function prefetch(text: string, voiceId: string): Promise<void> {
  try {
    await synthesize(text, voiceId);
  } catch {
  }
}
