import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { LANGUAGES, DEFAULT_LANGUAGE, languageOf } from './languages.js';
import { checkLimit, getUsage, formatRetryAfter } from './rateLimiter.js';
import { LIMITS } from './limits.js';
import { moderateText, warmUp as warmUpModeration } from './moderation.js';
import {
  PORT, HOST, ELEVENLABS_API_KEY as API_KEY, OPENAI_API_KEY as OPENAI_KEY,
  SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_MODEL, OPENAI_IMAGE_MODEL, DIST_DIR, DATA_DIR,
} from './env.js';
import { fetchWithTimeout, logServerError, openaiErrorMessage, ELEVENLABS_FRIENDLY_ERROR, OPENAI_FRIENDLY_ERROR } from './providerClient.js';
import { newId, saveImageFile, deleteImageFile } from './imageStore.js';
import { getCachedClip, saveCachedClip } from './audioCache.js';
import { transcribeAudio, generateLilyReply } from './lilyChat.js';
import { runStoryGraph } from './graphs/storyGraph.js';
import { CARD_REJECTED_MESSAGE, MODERATION_UNAVAILABLE_MESSAGE } from './messages.js';

const CARD_LIMIT = LIMITS.card;

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

const API_ROOT = 'https://api.elevenlabs.io';
const MODEL_ID = 'eleven_v3';
const OUT_FMT  = 'mp3_44100_128';
const VOICE_SETTINGS = { stability: 0.75, similarity_boost: 0.75, speed: 0.9 };

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

const authClient = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

async function requireAuth(req, res) {
  if (!authClient) {
    sendJson(res, 500, { error: 'Server is not configured for sign-in (SUPABASE_URL/SUPABASE_ANON_KEY missing).' });
    return null;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    sendJson(res, 401, { error: 'Sign in required.' });
    return null;
  }
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    sendJson(res, 401, { error: 'Your session has expired. Please sign in again.' });
    return null;
  }
  return { user: data.user, token };
}

function dbFor(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function dbError(res, error) {
  sendJson(res, 500, { error: error.message || 'Something went wrong saving that.' });
}

async function sendProviderError(res, status, provider, detail, who) {
  await logServerError(provider, detail, who);
  sendJson(res, status, { error: provider === 'elevenlabs' ? ELEVENLABS_FRIENDLY_ERROR : OPENAI_FRIENDLY_ERROR });
}

function requireKey(res, who) {
  if (API_KEY) return true;
  logServerError('elevenlabs', 'ELEVENLABS_API_KEY is not set', who);
  sendJson(res, 500, { error: ELEVENLABS_FRIENDLY_ERROR });
  return false;
}

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

async function handleVoices(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  if (!requireKey(res, auth.user.email)) return;

  const upstream = await fetchWithTimeout(`${API_ROOT}/v2/voices?page_size=100`, {
    headers: { 'xi-api-key': API_KEY },
  }, 10000);
  if (!upstream.ok) return sendProviderError(res, upstream.status, 'elevenlabs', await upstreamError(upstream), auth.user.email);

  const data = await upstream.json();
  sendJson(res, 200, {
    voices: (data.voices || [])
      .filter(v => v.labels?.gender === 'female' && v.labels?.age === 'young')
      .map(v => ({
        voice_id: v.voice_id,
        name:     v.name,
        labels:   v.labels || {},
      })),
  });
}

function handleLimits(res, auth) {
  const usage = {};
  for (const [name, limit] of Object.entries(LIMITS)) {
    usage[name] = { used: getUsage(name, auth.user.id, limit.windowMs), max: limit.max, label: limit.label };
  }
  sendJson(res, 200, usage);
}

async function handleTts(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  if (!requireKey(res, auth.user.email)) return;

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

  const cached = await getCachedClip(voiceId, text);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': cached.length });
    res.end(cached);
    return;
  }

  const upstream = await fetchWithTimeout(
    `${API_ROOT}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUT_FMT}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
    },
    30000
  );
  if (!upstream.ok) return sendProviderError(res, upstream.status, 'elevenlabs', await upstreamError(upstream), auth.user.email);

  const audio = Buffer.from(await upstream.arrayBuffer());
  await saveCachedClip(voiceId, text, audio);
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
  res.end(audio);
}

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

async function handleStory(req, res, auth) {
  if (!OPENAI_KEY) {
    return sendProviderError(res, 500, 'openai', 'OPENAI_API_KEY is not set', auth.user.email);
  }
  const db = dbFor(auth.token);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  let prompt = '', focus = '', minutes = 1, label = '', language = DEFAULT_LANGUAGE;
  try {
    ({ prompt = '', focus = '', minutes = 1, label = '', language = DEFAULT_LANGUAGE } = JSON.parse(Buffer.concat(chunks).toString()));
  } catch {
    return sendJson(res, 400, { error: 'Malformed request body.' });
  }
  language = normalizeLanguage(language);

  minutes = Math.min(5, Math.max(1, Number(minutes) || 1));
  const userPrompt = buildUserPrompt({
    prompt: String(prompt).trim().slice(0, 500),
    focus:  String(focus).trim().slice(0, 300),
  });
  if (!userPrompt) {
    return sendJson(res, 400, { error: 'Pick a focus or say what the story is about.' });
  }

  const cacheKey = [
    language, minutes, focus,
    String(prompt).trim().toLowerCase().replace(/\s+/g, ' '),
  ].join('|');
  const { data: existing, error: lookupErr } = await db
    .from('stories').select('id, characters, scenes')
    .eq('cache_key', cacheKey).maybeSingle();
  if (lookupErr) return dbError(res, lookupErr);
  if (existing) return sendJson(res, 200, existing);

  const clientGone = new AbortController();
  req.on('close', () => clientGone.abort());

  const result = await runStoryGraph({
    userPrompt, minutes, language,
    userId: auth.user.id, who: auth.user.email,
    signal: clientGone.signal,
  });

  if (result.status === 'aborted') return;
  if (result.status !== 'ok') return sendJson(res, result.httpStatus, { error: result.errorMessage });

  const { data: saved, error: insertErr } = await db.from('stories').insert({
    owner_id: auth.user.id,
    cache_key: cacheKey,
    language,
    label: String(label).trim() || String(prompt).trim() || 'A story',
    minutes,
    characters: result.characters,
    scenes: result.savedScenes,
  }).select('id').single();
  if (insertErr) return dbError(res, insertErr);

  sendJson(res, 200, { id: saved.id, characters: result.characters, scenes: result.savedScenes });
}

function normalizeLanguage(code) {
  return LANGUAGES[code] ? code : DEFAULT_LANGUAGE;
}

async function handleStoriesGet(res, auth, language) {
  const db = dbFor(auth.token);
  const { data, error } = await db
    .from('stories').select('id, label, minutes, characters, scenes, saved_at')
    .eq('language', normalizeLanguage(language))
    .order('saved_at', { ascending: false });
  if (error) return dbError(res, error);
  sendJson(res, 200, { stories: data.map(s => ({ ...s, savedAt: new Date(s.saved_at).getTime() })) });
}

async function handleDeleteStory(id, res, auth) {
  const db = dbFor(auth.token);
  try {
    const { data: removed } = await db.from('stories').select('scenes').eq('id', id).maybeSingle();
    const { error } = await db.from('stories').delete().eq('id', id);
    if (error) return dbError(res, error);
    if (removed) await Promise.all((removed.scenes || []).map(s => s.image ? deleteImageFile(s.image) : null));
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

function buildTranslatePrompt(language) {
  const lang = languageOf(language);
  return `You help build ${lang.name} flashcards for a 3-year-old.

Given one word or short phrase, reply with ONLY a JSON object, nothing else, no
markdown fences:
{"fa": "...", "en": "...", "image": "..."}

- "fa": the word in ${lang.name}, correct and natural, one word or a short phrase a
  toddler would use. Standard formal ${lang.name}, never a regional dialect or
  spoken-colloquial contraction.${lang.typingNote ? ' ' + lang.typingNote : ''}
- "en": a short, simple, literal English translation (one or two words), used only as a
  gloss, not sent to the image generator directly.
- "image": a short English description (10-20 words) for an illustrator drawing a single
  flashcard picture of this word, written to fit what the word actually is:
  - A concrete object, animal, food, or place (e.g. "apple", "dog", "kitchen"): describe
    that single thing simply and visually, e.g. "a single shiny red apple, nothing else".
  - A color word, on its own, with no object named (e.g. "yellow", "red"): describe a
    plain abstract blob or swatch of that color and nothing else, explicitly not attached
    to any object, e.g. "a large soft rounded blob of solid bright yellow color, abstract,
    no object, no animal, no shape that could be mistaken for anything else". Never pick
    an object of that color as the subject, a child would associate the word with that
    object instead of the color.
  - Another descriptive quality that isn't a color (e.g. "big", "happy", "cold", "soft"):
    describe a simple, universally clear visual that embodies just that quality, without
    inventing an unrelated object as the subject, e.g. "happy" as a simple smiling face
    icon, "big" as one large shape next to one small shape for size comparison, "cold" as
    a simple snowflake icon.
  - An action or verb (e.g. "running", "jumping"): describe a simple figure performing
    that action.
  - A phrase, greeting, question, or abstract expression that names no physical thing at
    all (e.g. "thank you", "goodbye", "do you remember"): describe a simple, universally
    understandable symbolic scene for that concept rather than inventing an unrelated
    random object, e.g. "thank you" as two hands clasped together warmly, "do you
    remember" as a thought bubble containing a small photo.
- If the input is already ${lang.name}, keep "fa" as given (correcting only obvious spelling)
  and just supply "en" and "image".
- If the input is nonsense or not a real word, still make a reasonable best-effort guess
  rather than refusing.`;
}

async function translateWord(word, language, who) {
  const upstream = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: buildTranslatePrompt(language) },
        { role: 'user',   content: word },
      ],
    }),
  }, 20000);
  if (!upstream.ok) {
    await logServerError('openai', await openaiErrorMessage(upstream), who);
    throw new Error(OPENAI_FRIENDLY_ERROR);
  }

  const data = await upstream.json();
  const raw  = data.choices?.[0]?.message?.content?.trim() || '';
  const jsonText = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed;
  try { parsed = JSON.parse(jsonText); } catch { parsed = null; }
  if (!parsed?.fa) throw new Error('Could not understand that word. Try another one.');

  return { fa: parsed.fa, en: parsed.en || word, image: parsed.image || parsed.en || word };
}

async function generateCardImage(imageDescription, who) {
  const prompt =
    `${imageDescription}, flat vector illustration for a children's flashcard, ` +
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
  if (!upstream.ok) {
    await logServerError('openai', await openaiErrorMessage(upstream), who);
    throw new Error(OPENAI_FRIENDLY_ERROR);
  }

  const data = await upstream.json();
  const b64  = data.data?.[0]?.b64_json;
  if (!b64) {
    await logServerError('openai', 'Image generation returned no b64_json', who);
    throw new Error(OPENAI_FRIENDLY_ERROR);
  }
  return b64;
}

async function handleCard(req, res, auth) {
  if (!OPENAI_KEY) {
    return sendProviderError(res, 500, 'openai', 'OPENAI_API_KEY is not set', auth.user.email);
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  let word = '', language = DEFAULT_LANGUAGE;
  try {
    ({ word = '', language = DEFAULT_LANGUAGE } = JSON.parse(Buffer.concat(chunks).toString()));
  } catch {
    return sendJson(res, 400, { error: 'Malformed request body.' });
  }
  word = word.trim().slice(0, 60);
  if (!word) return sendJson(res, 400, { error: 'Type a word first.' });

  try {
    const moderation = await moderateText(word);
    if (moderation.flagged) {
      await logServerError('moderation', `Card word rejected (${moderation.reason}): ${word}`, auth.user.email);
      return sendJson(res, 400, { error: CARD_REJECTED_MESSAGE });
    }
  } catch (e) {
    await logServerError('moderation', `Moderation check failed: ${e.message}`, auth.user.email);
    return sendJson(res, 503, { error: MODERATION_UNAVAILABLE_MESSAGE });
  }

  const cardLimit = checkLimit('card', auth.user.id, CARD_LIMIT.max, CARD_LIMIT.windowMs);
  if (!cardLimit.allowed) {
    return sendJson(res, 429, { error: `That's today's cards used up. Try again in ${formatRetryAfter(cardLimit.retryAfterMs)}.` });
  }

  try {
    const { fa, en, image: imageDescription } = await translateWord(word, normalizeLanguage(language), auth.user.email);
    const image = await generateCardImage(imageDescription, auth.user.email);
    sendJson(res, 200, { word_fa: fa, word_en: en, image: `data:image/png;base64,${image}` });
  } catch (e) {
    sendJson(res, 502, { error: e.message });
  }
}

const TALK_LIMIT = LIMITS.talk;

function parseDataUrl(dataUrl) {
  const match = /^data:([^,]*);base64,([\s\S]+)$/.exec(dataUrl || '');
  if (!match) return null;
  const mimeType = match[1].split(';')[0] || 'audio/webm';
  return { mimeType, buffer: Buffer.from(match[2], 'base64') };
}

async function handleTalk(req, res, auth) {
  if (!API_KEY)    return sendProviderError(res, 500, 'elevenlabs', 'ELEVENLABS_API_KEY is not set', auth.user.email);
  if (!OPENAI_KEY) return sendProviderError(res, 500, 'openai', 'OPENAI_API_KEY is not set', auth.user.email);

  let audio, language = DEFAULT_LANGUAGE;
  try {
    ({ audio, language = DEFAULT_LANGUAGE } = await readJsonBody(req));
  } catch {
    return sendJson(res, 400, { error: 'Malformed request body.' });
  }
  language = normalizeLanguage(language);

  const parsed = parseDataUrl(audio);
  if (!parsed) return sendJson(res, 400, { error: 'No recording received.' });

  const talkLimit = checkLimit('talk', auth.user.id, TALK_LIMIT.max, TALK_LIMIT.windowMs);
  if (!talkLimit.allowed) {
    return sendJson(res, 429, { error: `That's today's talking used up. Try again in ${formatRetryAfter(talkLimit.retryAfterMs)}.` });
  }

  try {
    const transcript = await transcribeAudio(parsed.buffer, parsed.mimeType, auth.user.email);

    if (transcript.trim().length < 2) {
      const reply = await generateLilyReply(language, 'unclear', null, auth.user.email);
      return sendJson(res, 200, { transcript: '', reply });
    }

    try {
      const moderation = await moderateText(transcript);
      if (moderation.flagged) {
        await logServerError('moderation', `Talk message deflected (${moderation.reason}): ${transcript}`, auth.user.email);
        const reply = await generateLilyReply(language, 'deflect', null, auth.user.email);
        return sendJson(res, 200, { transcript, reply });
      }
    } catch (e) {
      await logServerError('moderation', `Moderation check failed: ${e.message}`, auth.user.email);
      return sendJson(res, 503, { error: MODERATION_UNAVAILABLE_MESSAGE });
    }

    const reply = await generateLilyReply(language, 'reply', transcript, auth.user.email);
    sendJson(res, 200, { transcript, reply });
  } catch (e) {
    sendJson(res, 502, { error: e.message });
  }
}

async function handleVocabularyGet(res, auth, language) {
  const lang = normalizeLanguage(language);
  const db = dbFor(auth.token);
  const [{ data: collections, error: collErr }, { data: cards, error: cardErr }] = await Promise.all([
    db.from('collections').select('id, name, created_at').eq('language', lang),
    db.from('cards').select('id, collection_id, word_fa, word_en, image, created_at').eq('language', lang),
  ]);
  if (collErr) return dbError(res, collErr);
  if (cardErr) return dbError(res, cardErr);
  sendJson(res, 200, {
    collections: collections.map(c => ({ id: c.id, name: c.name, createdAt: new Date(c.created_at).getTime() })),
    cards: cards.map(c => ({
      id: c.id, collectionId: c.collection_id, word_fa: c.word_fa, word_en: c.word_en,
      image: c.image, createdAt: new Date(c.created_at).getTime(),
    })),
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function handleCreateCollection(req, res, auth) {
  let name = '', language = DEFAULT_LANGUAGE;
  try { ({ name = '', language = DEFAULT_LANGUAGE } = await readJsonBody(req)); }
  catch { return sendJson(res, 400, { error: 'Malformed request body.' }); }

  name = name.trim().slice(0, 40);
  if (!name) return sendJson(res, 400, { error: 'Give the collection a name.' });

  const db = dbFor(auth.token);
  const { data, error } = await db
    .from('collections').insert({ owner_id: auth.user.id, name, language: normalizeLanguage(language) })
    .select('id, name, created_at').single();
  if (error) return dbError(res, error);
  sendJson(res, 200, { id: data.id, name: data.name, createdAt: new Date(data.created_at).getTime() });
}

async function handleDeleteCollection(id, res, auth) {
  const db = dbFor(auth.token);
  try {
    const { data: removedCards } = await db.from('cards').select('image').eq('collection_id', id);

    const { error } = await db.from('collections').delete().eq('id', id);
    if (error) return dbError(res, error);
    await Promise.all((removedCards || []).map(c => deleteImageFile(c.image)));
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleAddCard(collectionId, req, res, auth) {
  let word_fa, word_en, image;
  try { ({ word_fa, word_en, image } = await readJsonBody(req)); }
  catch { return sendJson(res, 400, { error: 'Malformed request body.' }); }

  if (!word_fa || !image) return sendJson(res, 400, { error: 'Missing word or picture.' });

  const db = dbFor(auth.token);
  try {

    const { data: coll } = await db.from('collections').select('id, language').eq('id', collectionId).maybeSingle();
    if (!coll) throw new Error('That collection no longer exists.');

    const imagePath = await saveImageFile(auth.user.id, newId('card'), image);
    const card = { owner_id: auth.user.id, collection_id: collectionId, language: coll.language, word_fa, word_en: word_en || '', image: imagePath };

    const { data, error } = await db.from('cards').insert(card).select('id, created_at').single();
    if (error) throw error;

    sendJson(res, 200, { id: data.id, collectionId, word_fa, word_en: word_en || '', image: imagePath, createdAt: new Date(data.created_at).getTime() });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleDeleteCard(id, res, auth) {
  const db = dbFor(auth.token);
  try {
    const { data: card } = await db.from('cards').select('image').eq('id', id).maybeSingle();
    const { error } = await db.from('cards').delete().eq('id', id);
    if (error) return dbError(res, error);
    if (card?.image) await deleteImageFile(card.image);
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleUserData(req, res, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(DATA_DIR, rel.replace(/^\/data\//, ''));

  if (!file.startsWith(DATA_DIR)) {
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

async function handleStatic(req, res, pathname) {

  const rel  = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST_DIR, rel === '/' ? 'index.html' : rel);

  if (!file.startsWith(DIST_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    if (extname(rel)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    try {
      const body = await readFile(join(DIST_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  }
}

createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);

  try {

    if (pathname === '/api/voices'     && req.method === 'GET')  return await handleVoices(req, res);
    if (pathname === '/api/tts'        && req.method === 'POST') return await handleTts(req, res);
    if (pathname === '/api/limits' && req.method === 'GET') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return handleLimits(res, auth);
    }

    if (pathname === '/api/story' && req.method === 'POST') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleStory(req, res, auth);
    }
    if (pathname === '/api/card' && req.method === 'POST') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleCard(req, res, auth);
    }
    if (pathname === '/api/talk' && req.method === 'POST') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleTalk(req, res, auth);
    }
    if (pathname === '/api/vocabulary' && req.method === 'GET') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleVocabularyGet(res, auth, searchParams.get('language'));
    }
    if (pathname === '/api/stories' && req.method === 'GET') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleStoriesGet(res, auth, searchParams.get('language'));
    }
    if (pathname === '/api/collections' && req.method === 'POST') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleCreateCollection(req, res, auth);
    }

    const storyMatch = pathname.match(/^\/api\/stories\/([^/]+)$/);
    if (storyMatch && req.method === 'DELETE') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleDeleteStory(decodeURIComponent(storyMatch[1]), res, auth);
    }

    const collMatch  = pathname.match(/^\/api\/collections\/([^/]+)$/);
    if (collMatch && req.method === 'DELETE') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleDeleteCollection(decodeURIComponent(collMatch[1]), res, auth);
    }

    const cardsMatch = pathname.match(/^\/api\/collections\/([^/]+)\/cards$/);
    if (cardsMatch && req.method === 'POST') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleAddCard(decodeURIComponent(cardsMatch[1]), req, res, auth);
    }

    const cardMatch  = pathname.match(/^\/api\/cards\/([^/]+)$/);
    if (cardMatch && req.method === 'DELETE') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleDeleteCard(decodeURIComponent(cardMatch[1]), res, auth);
    }

    if (pathname.startsWith('/data/')) return await handleUserData(req, res, pathname);

    return await handleStatic(req, res, pathname);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}).listen(PORT, HOST, () => {
  console.log(`Dastaan → http://${HOST}:${PORT}`);
  if (!API_KEY) {
    console.warn('\n⚠  ELEVENLABS_API_KEY is not set. The app will load but stay silent.');
    console.warn('   Restart with: ELEVENLABS_API_KEY=sk_… node server.js\n');
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('\n⚠  SUPABASE_URL/SUPABASE_ANON_KEY are not set. Sign-in will fail.');
    console.warn('   Restart with those set alongside the other env vars.\n');
  }
  warmUpModeration().then(ok => {
    if (!ok) console.warn('\n⚠  Moderation model did not warm up. Story/card requests will fail until Ollama is reachable.\n');
  });
});
