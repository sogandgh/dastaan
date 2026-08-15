/**
 * server.js — static file server + ElevenLabs proxy
 *
 * Run with:
 *   ELEVENLABS_API_KEY=sk_… node server.js
 *
 * The browser never sees the API key. The page calls /api/voices and /api/tts
 * on this server, which attaches the key from the environment and forwards the
 * request to ElevenLabs. Node's stdlib only — there is nothing to npm install.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT        = process.env.PORT || 8000;
const API_KEY     = process.env.ELEVENLABS_API_KEY;
const OPENAI_KEY  = process.env.OPENAI_API_KEY;
const OPENAI_MODEL      = process.env.OPENAI_MODEL || 'gpt-5-mini';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini';
const ROOT        = process.cwd();

// Collections and cards are shared across every device that opens this
// server — one family vocabulary, not one per browser. They live in a JSON
// file plus a folder of PNGs, both outside git (see .gitignore), so `git
// pull` on deploy never touches them.
const DATA_DIR   = join(ROOT, 'data');
const IMAGES_DIR = join(DATA_DIR, 'images');
const VOCAB_FILE = join(DATA_DIR, 'vocabulary.json');

const API_ROOT = 'https://api.elevenlabs.io';
const MODEL_ID = 'eleven_v3';     // the only model that supports Persian (fas)
const OUT_FMT  = 'mp3_44100_128';
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, speed: 0.9 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Every outbound call to ElevenLabs or OpenAI goes through here. Plain
 * `fetch` has no overall timeout in Node — if either provider ever hangs,
 * a request would otherwise wait forever and a parent would just see a
 * spinner that never resolves. On timeout or any network-level failure this
 * throws a plain, non-technical Error; callers don't need their own
 * try/catch for that case, only for reading the response once it exists.
 */
async function fetchWithTimeout(url, options = {}, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error("That's taking longer than it should. Please try again.");
    }
    throw new Error("Couldn't reach the server right now. Please try again.");
  } finally {
    clearTimeout(timer);
  }
}

function requireKey(res) {
  if (API_KEY) return true;
  sendJson(res, 500, {
    error: 'ELEVENLABS_API_KEY is not set. Start the server with ' +
           'ELEVENLABS_API_KEY=sk_… node server.js',
  });
  return false;
}

/** Turn an ElevenLabs error response into something worth showing a user. */
async function upstreamError(upstream) {
  if (upstream.status === 401) return 'ElevenLabs rejected the API key in ELEVENLABS_API_KEY.';
  if (upstream.status === 429) return 'ElevenLabs rate limit or quota reached.';
  try {
    const body = await upstream.json();
    return body?.detail?.message || body?.detail?.status || `ElevenLabs error ${upstream.status}.`;
  } catch {
    return `ElevenLabs error ${upstream.status}.`;
  }
}

async function handleVoices(res) {
  if (!requireKey(res)) return;

  const upstream = await fetchWithTimeout(`${API_ROOT}/v2/voices?page_size=100`, {
    headers: { 'xi-api-key': API_KEY },
  }, 10000);
  if (!upstream.ok) return sendJson(res, upstream.status, { error: await upstreamError(upstream) });

  const data = await upstream.json();
  sendJson(res, 200, {
    voices: (data.voices || []).map(v => ({
      voice_id: v.voice_id,
      name:     v.name,
      labels:   v.labels || {},
    })),
  });
}

async function handleTts(req, res) {
  if (!requireKey(res)) return;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  let text, voiceId;
  try {
    ({ text, voiceId } = JSON.parse(Buffer.concat(chunks).toString()));
  } catch {
    return sendJson(res, 400, { error: 'Malformed request body.' });
  }
  if (!text)    return sendJson(res, 400, { error: 'Nothing to say.' });
  if (!voiceId) return sendJson(res, 400, { error: 'No voice selected.' });

  const upstream = await fetchWithTimeout(
    `${API_ROOT}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUT_FMT}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
    },
    30000
  );
  if (!upstream.ok) return sendJson(res, upstream.status, { error: await upstreamError(upstream) });

  const audio = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
  res.end(audio);
}

/**
 * Story generation. The grown-up may type the request in English or Persian —
 * the story always comes back in Persian, because that is the point of the app.
 */
const WORDS_PER_MINUTE = 130;   // measured against narration at speed 0.9

function buildSystemPrompt(minutes) {
  const words = Math.round(minutes * WORDS_PER_MINUTE);
  return `You write bedtime stories in Persian (Farsi) for a 3-year-old.

The request may be written in English or in Persian. Either way, always write the story in Persian.

Rules:
- Reply with ONLY the story text in Persian script. No title, no transliteration, no English, no markdown, no quotation marks around the whole story.
- About ${words} words — roughly ${minutes} minute${minutes > 1 ? 's' : ''} read aloud. This length matters; stay close to it.
- Use simple words a 3-year-old knows. Short sentences.
- Warm, gentle and happy. Never scary, sad or violent. Always end well.
- Use the zero-width non-joiner correctly (می‌کرد, برگ‌ها).`;
}

/**
 * A developmental focus is a teaching goal, not a plot. The story should model
 * the behaviour through a character a child can copy, never lecture the child.
 */
function buildUserPrompt({ prompt, focus }) {
  const parts = [];
  if (focus) {
    parts.push(
      `Write a story that gently helps a 3-year-old with ${focus}. ` +
      `Show a character doing it well and feeling good about it. ` +
      `Do not lecture, moralise, or address the child directly — just tell the story.`
    );
  }
  if (prompt) {
    parts.push(focus ? `Also make the story about: ${prompt}` : prompt);
  }
  return parts.join('\n\n');
}

async function handleStory(req, res) {
  if (!OPENAI_KEY) {
    return sendJson(res, 500, {
      error: 'OPENAI_API_KEY is not set. Start the server with it to use stories.',
    });
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  let prompt = '', focus = '', minutes = 1;
  try {
    ({ prompt = '', focus = '', minutes = 1 } = JSON.parse(Buffer.concat(chunks).toString()));
  } catch {
    return sendJson(res, 400, { error: 'Malformed request body.' });
  }

  minutes = Math.min(5, Math.max(1, Number(minutes) || 1));
  const userPrompt = buildUserPrompt({
    prompt: String(prompt).trim().slice(0, 500),
    focus:  String(focus).trim().slice(0, 300),
  });
  if (!userPrompt) {
    return sendJson(res, 400, { error: 'Pick a focus or say what the story is about.' });
  }

  const upstream = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      // Story writing needs no deliberation; this keeps it a few seconds rather
      // than tens of seconds, which matters when a small child is waiting.
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: buildSystemPrompt(minutes) },
        { role: 'user',   content: userPrompt },
      ],
    }),
  }, 30000);

  if (!upstream.ok) {
    let detail = `OpenAI error ${upstream.status}.`;
    try {
      const body = await upstream.json();
      detail = body?.error?.message || detail;
    } catch { /* non-JSON error body */ }
    return sendJson(res, upstream.status, { error: detail });
  }

  const data  = await upstream.json();
  const story = data.choices?.[0]?.message?.content?.trim();
  if (!story) return sendJson(res, 502, { error: 'No story came back. Try again.' });

  sendJson(res, 200, { story });
}

/**
 * Custom flashcards. A parent types one word, in English or Persian; the
 * server translates it (skipping the call entirely if it's already Farsi
 * script), then asks OpenAI for a flat-vector illustration matching the
 * flashcards already in pictures/. The audio is handled by the existing
 * /api/tts path — this endpoint only returns text + image.
 */
const TRANSLATE_SYSTEM_PROMPT = `You help build Persian flashcards for a 3-year-old.

Given one word or short phrase, reply with ONLY a JSON object, nothing else, no
markdown fences:
{"fa": "...", "en": "..."}

- "fa": the word in Persian (Farsi script), correct and natural, one word or a short
  phrase a toddler would use. Use the zero-width non-joiner correctly (می‌کرد, برگ‌ها).
- "en": a short, simple, literal English translation (one or two words) — used only to
  generate a picture, so keep it concrete and unambiguous (e.g. "apple", not "a healthy
  red fruit").
- If the input is already Persian, keep "fa" as given (correcting only obvious spelling)
  and just supply "en".
- If the input is nonsense or not a real word, still make a reasonable best-effort guess
  rather than refusing.`;

async function translateWord(word) {
  const upstream = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
        { role: 'user',   content: word },
      ],
    }),
  }, 20000);
  if (!upstream.ok) throw new Error(await openaiErrorMessage(upstream));

  const data = await upstream.json();
  const raw  = data.choices?.[0]?.message?.content?.trim() || '';
  const jsonText = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed;
  try { parsed = JSON.parse(jsonText); } catch { parsed = null; }
  if (!parsed?.fa) throw new Error('Could not understand that word. Try another one.');

  return { fa: parsed.fa, en: parsed.en || word };
}

async function generateCardImage(wordEn) {
  const prompt =
    `${wordEn}, flat vector illustration for a children's flashcard, single subject ` +
    `centered, simple bold shapes, bright cheerful colors, soft shading, solid white ` +
    `background, no text, no watermark, no border`;

  const upstream = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: '1024x1024',
      quality: 'low',
      n: 1,
    }),
  }, 45000);
  if (!upstream.ok) throw new Error(await openaiErrorMessage(upstream));

  const data = await upstream.json();
  const b64  = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image came back. Try a different word.');
  return b64;
}

async function openaiErrorMessage(upstream) {
  try {
    const body = await upstream.json();
    return body?.error?.message || `OpenAI error ${upstream.status}.`;
  } catch {
    return `OpenAI error ${upstream.status}.`;
  }
}

async function handleCard(req, res) {
  if (!OPENAI_KEY) {
    return sendJson(res, 500, {
      error: 'OPENAI_API_KEY is not set. Start the server with it to add custom cards.',
    });
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  let word = '';
  try {
    ({ word = '' } = JSON.parse(Buffer.concat(chunks).toString()));
  } catch {
    return sendJson(res, 400, { error: 'Malformed request body.' });
  }
  word = word.trim().slice(0, 60);
  if (!word) return sendJson(res, 400, { error: 'Type a word first.' });

  try {
    const { fa, en } = await translateWord(word);
    const image = await generateCardImage(en);
    sendJson(res, 200, { word_fa: fa, word_en: en, image: `data:image/png;base64,${image}` });
  } catch (e) {
    sendJson(res, 502, { error: e.message });
  }
}

/**
 * Shared vocabulary: collections and the cards inside them, one file for the
 * whole family. Every mutation is funneled through a single promise chain so
 * two requests arriving close together (two devices tapping at once) can't
 * read-modify-write over each other — reads and writes all happen one at a
 * time, in order. `mutationTail` always resolves even when an individual
 * mutation throws, so one failure can't wedge every request after it.
 */
let vocabPromise  = null;
let mutationTail  = Promise.resolve();

async function loadVocabulary() {
  if (vocabPromise) return vocabPromise;
  vocabPromise = (async () => {
    try {
      return JSON.parse(await readFile(VOCAB_FILE, 'utf8'));
    } catch {
      return { collections: [], cards: [] };   // first run, or file missing
    }
  })();
  return vocabPromise;
}

/** Run `fn(data)` exclusively, persist whatever it mutated, return its result. */
function mutateVocabulary(fn) {
  const result = mutationTail.then(async () => {
    const data = await loadVocabulary();
    const ret = await fn(data);
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(VOCAB_FILE, JSON.stringify(data, null, 2));
    vocabPromise = Promise.resolve(data);
    return ret;
  });
  mutationTail = result.catch(() => {});   // keep the chain alive past a failure
  return result;
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function saveImageFile(id, dataUrl) {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('That image could not be saved.');
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  await mkdir(IMAGES_DIR, { recursive: true });
  const filename = `${id}.${ext}`;
  await writeFile(join(IMAGES_DIR, filename), Buffer.from(match[2], 'base64'));
  return `/data/images/${filename}`;
}

async function deleteImageFile(publicPath) {
  if (!publicPath || !publicPath.startsWith('/data/images/')) return;
  try { await unlink(join(ROOT, publicPath)); } catch { /* already gone */ }
}

async function handleVocabularyGet(res) {
  sendJson(res, 200, await loadVocabulary());
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function handleCreateCollection(req, res) {
  let name = '';
  try { ({ name = '' } = await readJsonBody(req)); }
  catch { return sendJson(res, 400, { error: 'Malformed request body.' }); }

  name = name.trim().slice(0, 40);
  if (!name) return sendJson(res, 400, { error: 'Give the collection a name.' });

  const collection = { id: newId('coll'), name, createdAt: Date.now() };
  try {
    await mutateVocabulary(data => { data.collections.push(collection); });
    sendJson(res, 200, collection);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleDeleteCollection(id, res) {
  try {
    const removedImages = [];
    await mutateVocabulary(data => {
      data.collections = data.collections.filter(c => c.id !== id);
      data.cards = data.cards.filter(c => {
        if (c.collectionId !== id) return true;
        removedImages.push(c.image);
        return false;
      });
    });
    await Promise.all(removedImages.map(deleteImageFile));
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleAddCard(collectionId, req, res) {
  let word_fa, word_en, image;
  try { ({ word_fa, word_en, image } = await readJsonBody(req)); }
  catch { return sendJson(res, 400, { error: 'Malformed request body.' }); }

  if (!word_fa || !image) return sendJson(res, 400, { error: 'Missing word or picture.' });

  try {
    const id = newId('card');
    const imagePath = await saveImageFile(id, image);
    const card = { id, collectionId, word_fa, word_en: word_en || '', image: imagePath, createdAt: Date.now() };

    await mutateVocabulary(data => {
      if (!data.collections.some(c => c.id === collectionId)) {
        throw new Error('That collection no longer exists.');
      }
      data.cards.push(card);
    });
    sendJson(res, 200, card);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleDeleteCard(id, res) {
  try {
    let imageToRemove = null;
    await mutateVocabulary(data => {
      imageToRemove = data.cards.find(c => c.id === id)?.image || null;
      data.cards = data.cards.filter(c => c.id !== id);
    });
    if (imageToRemove) await deleteImageFile(imageToRemove);
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleStatic(req, res, pathname) {
  // normalize() collapses any ../ so requests cannot escape the project directory.
  const rel  = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel === '/' ? 'index.html' : rel);

  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (pathname === '/api/voices'     && req.method === 'GET')  return await handleVoices(res);
    if (pathname === '/api/tts'        && req.method === 'POST') return await handleTts(req, res);
    if (pathname === '/api/story'      && req.method === 'POST') return await handleStory(req, res);
    if (pathname === '/api/card'       && req.method === 'POST') return await handleCard(req, res);
    if (pathname === '/api/vocabulary' && req.method === 'GET')  return await handleVocabularyGet(res);
    if (pathname === '/api/collections' && req.method === 'POST') return await handleCreateCollection(req, res);

    const collMatch  = pathname.match(/^\/api\/collections\/([^/]+)$/);
    if (collMatch && req.method === 'DELETE') {
      return await handleDeleteCollection(decodeURIComponent(collMatch[1]), res);
    }

    const cardsMatch = pathname.match(/^\/api\/collections\/([^/]+)\/cards$/);
    if (cardsMatch && req.method === 'POST') {
      return await handleAddCard(decodeURIComponent(cardsMatch[1]), req, res);
    }

    const cardMatch  = pathname.match(/^\/api\/cards\/([^/]+)$/);
    if (cardMatch && req.method === 'DELETE') {
      return await handleDeleteCard(decodeURIComponent(cardMatch[1]), res);
    }

    return await handleStatic(req, res, pathname);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  console.log(`Learn with Bluey → http://localhost:${PORT}`);
  if (!API_KEY) {
    console.warn('\n⚠  ELEVENLABS_API_KEY is not set — the app will load but stay silent.');
    console.warn('   Restart with: ELEVENLABS_API_KEY=sk_… node server.js\n');
  }
});
