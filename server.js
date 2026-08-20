import { createServer } from 'node:http';
import { readFile, writeFile, appendFile, mkdir, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { LANGUAGES, DEFAULT_LANGUAGE, languageOf } from './languages.js';
import { checkLimit, formatRetryAfter } from './rateLimiter.js';
import { moderateText, warmUp as warmUpModeration } from './moderation.js';

const STORY_REJECTED_MESSAGE = "That story idea isn't something we can turn into a bedtime story. Try a different idea.";
const CARD_REJECTED_MESSAGE  = "That word isn't something we can make a flashcard for. Try a different word.";
const MODERATION_UNAVAILABLE_MESSAGE = "Couldn't check that right now. Try again in a moment.";

const CARD_LIMIT  = { max: 15, windowMs: 60 * 60 * 1000 };
const STORY_LIMIT = { max: 5,  windowMs: 24 * 60 * 60 * 1000 };

function loadEnvFile(path) {
  let content;
  try { content = readFileSync(path, 'utf8'); } catch { return; }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(join(process.cwd(), '.env'));

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

const PORT        = process.env.PORT || 8000;
const API_KEY     = process.env.ELEVENLABS_API_KEY;
const OPENAI_KEY  = process.env.OPENAI_API_KEY;
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const OPENAI_STORY_MODEL = process.env.OPENAI_STORY_MODEL || 'gpt-5';
const OPENAI_MODEL       = process.env.OPENAI_MODEL || 'gpt-5-mini';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini';
const ROOT        = process.cwd();

const DATA_DIR   = join(ROOT, 'data');
const IMAGES_DIR = join(DATA_DIR, 'images');
const STORY_IMAGES_DIR = join(DATA_DIR, 'story-images');

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

async function fetchWithTimeout(url, options = {}, ms = 20000, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const forwardAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', forwardAbort, { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error("That's taking longer than it should. Please try again.");
    }
    throw new Error("Couldn't reach the server right now. Please try again.");
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort);
  }
}

const ELEVENLABS_FRIENDLY_ERROR = "The voice isn't working right now. Try again in a bit.";
const OPENAI_FRIENDLY_ERROR     = "Couldn't do that right now. Try again in a bit.";
const ERROR_LOG_FILE = join(DATA_DIR, 'errors.log');

async function logServerError(provider, detail, who) {
  const line = `[${new Date().toISOString()}]${who ? ` [${who}]` : ''} ${provider}: ${detail}`;
  console.error(line);
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(ERROR_LOG_FILE, line + '\n');
  } catch {  }
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
    voices: (data.voices || []).map(v => ({
      voice_id: v.voice_id,
      name:     v.name,
      labels:   v.labels || {},
    })),
  });
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
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
  res.end(audio);
}

const WORDS_PER_MINUTE = 130;

function buildSystemPrompt(minutes, language = DEFAULT_LANGUAGE) {
  const lang = languageOf(language);
  const words = Math.round(minutes * WORDS_PER_MINUTE);
  const connectives = ` Write the way a parent actually talks out
  loud telling a bedtime story — natural, flowing sentences with real connective words
  (${lang.connectives}), not a string of short clipped fragments. Varying sentence
  length is fine; choppiness is not.`;
  const typingNote = lang.typingNote ? `\n- ${lang.typingNote}` : '';
  const cultureNote = `\n- Don't tie the story to ${lang.cultureNote} culture (names included) unless the request\n  asks for that — keep it global.`;
  return `You write bedtime stories in ${lang.name} for a 3-year-old.

The request may be written in English or in ${lang.name}. Either way, always write the story in ${lang.name}.

Reply with ONLY a JSON object, nothing else, no markdown fences:
{"characters": "...", "scenes": [{"text": "...", "image": "..."}, ...]}

The story is broken into scenes so a picture can be shown for each one while it plays.
Every scene is illustrated by a separate artist working alone, with no memory of the
other scenes and no picture of the story's characters — "characters" and each scene's
"image" line are the only things any of them ever sees, so those have to carry
everything needed for the character to look like the same person or animal every time:
- "characters": one line, in English, fixed for the whole story, describing every named
  character's visual appearance for an illustrator — species or age and gender, hair or
  fur colour and style, and clothing colour, e.g. "Sara: a small girl, short brown hair,
  yellow t-shirt. Mom: a woman, brown hair in a bun, green apron." Nothing about
  personality or plot, only what a repeated illustration needs to look consistent.
- "scenes": 3 to 6 of them, at natural story-beat boundaries (a scene ends when the
  setting, action, or moment changes) — never mid-sentence. Roughly equal in length.
  - "text": that scene's narration, in ${lang.name}. No title, no transliteration, no
    English, no markdown, no quotation marks. Concatenated in order, the scenes' "text"
    fields are the whole story.
  - "image": a short English description (10-20 words) of just that scene's setting and
    action — concrete and visual (who's there, where, doing what). Refer to characters
    only by the traits already given in "characters" (e.g. "the girl with brown hair"),
    since the illustrator for this scene never sees their name or any other scene.

Rules for the story itself:
- About ${words} words total across all scenes — roughly ${minutes} minute${minutes > 1 ? 's' : ''} read aloud. This length matters; stay close to it.
- Very simple ${lang.name} words a 3-year-old knows.${connectives}
- One or two main characters, named, with a small, easy-to-follow problem or adventure for them — something they actually have to work at or figure out, not something that just happens to them.
- Keep the story focused on one main idea. Every event should follow from a *reason* given earlier in the story — not from convenience. Don't introduce a new creature, object, or character partway through unless the story already gave a reason it would be there; a stray animal wandering in to make a sound is exactly the kind of random detail to avoid.
- Playful sounds, actions, and dialogue to bring it to life, woven naturally into full sentences rather than standing alone as fragments.
- Vivid but simple descriptions — concrete things a toddler has actually seen, not abstract ideas.
- Warm and gentle throughout. Never scary, sad, violent, or sarcastic. A satisfying, happy ending.
- Don't moralise, and don't let a lesson feel forced — if the story is teaching something, it should come through what happens, never through being told.${typingNote}
- Get the spelling of every word right, especially ${lang.name} names for animals, foods,
  and objects that aren't the everyday obvious ones — this gets read aloud by a
  text-to-speech voice, which pronounces exactly what's written, so a misspelled or
  invented word comes out mispronounced.${cultureNote}
- The voice reading this aloud understands audio delivery tags in square brackets — [giggles], [laughs], [whispers], [excited], [curious], [mischievously], [sighs]. Place 3-6 of them across the whole story, right before the word or line they should colour, wherever a moment actually calls for it (a giggle after something silly, a whisper for a secret, excitement at a happy surprise). Always in English, in brackets, even though the story itself is in ${lang.name}, and they belong in "text", never in "image". Don't overuse them — most sentences need none.`;
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

  try {
    const moderation = await moderateText(userPrompt);
    if (moderation.flagged) {
      await logServerError('moderation', `Story prompt rejected (${moderation.reason}): ${userPrompt.slice(0, 200)}`, auth.user.email);
      return sendJson(res, 400, { error: STORY_REJECTED_MESSAGE });
    }
  } catch (e) {
    await logServerError('moderation', `Moderation check failed: ${e.message}`, auth.user.email);
    return sendJson(res, 503, { error: MODERATION_UNAVAILABLE_MESSAGE });
  }

  const storyLimit = checkLimit('story', auth.user.id, STORY_LIMIT.max, STORY_LIMIT.windowMs);
  if (!storyLimit.allowed) {
    return sendJson(res, 429, { error: `That's today's stories used up. Try again in ${formatRetryAfter(storyLimit.retryAfterMs)}.` });
  }

  const clientGone = new AbortController();
  req.on('close', () => clientGone.abort());
  const bail = () => clientGone.signal.aborted;

  const upstream = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_STORY_MODEL,

      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: buildSystemPrompt(minutes, language) },
        { role: 'user',   content: userPrompt },
      ],
    }),
  }, 30000, clientGone.signal);
  if (bail()) return;

  if (!upstream.ok) {
    let detail = `OpenAI error ${upstream.status}.`;
    try {
      const body = await upstream.json();
      detail = body?.error?.message || detail;
    } catch {  }
    return sendProviderError(res, upstream.status, 'openai', detail, auth.user.email);
  }

  const data = await upstream.json();
  const raw  = data.choices?.[0]?.message?.content?.trim() || '';
  const jsonText = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let scenes, characters;
  try {
    ({ scenes, characters } = JSON.parse(jsonText));
  } catch {
    scenes = null;
  }
  if (!Array.isArray(scenes) || scenes.length === 0 || !scenes.every(s => s?.text)) {
    return sendProviderError(res, 502, 'openai', `Malformed scenes JSON: ${jsonText.slice(0, 500)}`, auth.user.email);
  }

  const images = await Promise.all(scenes.map(async (s, i) => {
    if (!s.image) return null;
    const fullPrompt = characters ? `${characters}. ${s.image}` : s.image;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (bail()) return null;
      try {
        return await generateSceneImage(fullPrompt, clientGone.signal, auth.user.email);
      } catch (e) {
        lastErr = e;
      }
    }
    if (!bail()) await logServerError('openai', `Scene ${i} image failed after 2 attempts: ${lastErr?.message || lastErr}`, auth.user.email);
    return null;
  }));
  if (bail()) return;

  const fileId = newId('story');
  const savedScenes = await Promise.all(scenes.map(async (s, i) =>
    images[i]
      ? { text: s.text, image: await saveImageFile(auth.user.id, `${fileId}-${i}`, `data:image/png;base64,${images[i]}`, STORY_IMAGES_DIR) }
      : { text: s.text, image: null }
  ));

  const { data: saved, error: insertErr } = await db.from('stories').insert({
    owner_id: auth.user.id,
    cache_key: cacheKey,
    language,
    label: String(label).trim() || String(prompt).trim() || 'A story',
    minutes,
    characters,
    scenes: savedScenes,
  }).select('id').single();
  if (insertErr) return dbError(res, insertErr);

  sendJson(res, 200, { id: saved.id, characters, scenes: savedScenes });
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
{"fa": "...", "en": "..."}

- "fa": the word in ${lang.name}, correct and natural, one word or a short
  phrase a toddler would use.${lang.typingNote ? ' ' + lang.typingNote : ''}
- "en": a short, simple, literal English translation (one or two words) — used only to
  generate a picture, so keep it concrete and unambiguous (e.g. "apple", not "a healthy
  red fruit").
- If the input is already ${lang.name}, keep "fa" as given (correcting only obvious spelling)
  and just supply "en".
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

  return { fa: parsed.fa, en: parsed.en || word };
}

async function generateCardImage(wordEn, who) {
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

async function generateSceneImage(sceneEn, signal, who) {
  const prompt =
    `${sceneEn}, flat vector illustration for a children's picture book, warm and ` +
    `cheerful, simple bold shapes, soft shading, gentle pastel background, no text, ` +
    `no watermark, no border, universal setting and clothing not tied to any one ` +
    `country or culture`;

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
  }, 45000, signal);
  if (!upstream.ok) {
    await logServerError('openai', await openaiErrorMessage(upstream), who);
    throw new Error(OPENAI_FRIENDLY_ERROR);
  }

  const data = await upstream.json();
  const b64  = data.data?.[0]?.b64_json;
  if (!b64) {
    await logServerError('openai', 'Scene image generation returned no b64_json', who);
    throw new Error(OPENAI_FRIENDLY_ERROR);
  }
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
    return sendJson(res, 429, { error: `That's this hour's cards used up. Try again in ${formatRetryAfter(cardLimit.retryAfterMs)}.` });
  }

  try {
    const { fa, en } = await translateWord(word, normalizeLanguage(language), auth.user.email);
    const image = await generateCardImage(en, auth.user.email);
    sendJson(res, 200, { word_fa: fa, word_en: en, image: `data:image/png;base64,${image}` });
  } catch (e) {
    sendJson(res, 502, { error: e.message });
  }
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function saveImageFile(userId, id, dataUrl, dir = IMAGES_DIR) {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('That image could not be saved.');
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const userDir = join(dir, userId);
  await mkdir(userDir, { recursive: true });
  const filename = `${id}.${ext}`;
  await writeFile(join(userDir, filename), Buffer.from(match[2], 'base64'));
  return `/data/${dir === STORY_IMAGES_DIR ? 'story-images' : 'images'}/${userId}/${filename}`;
}

async function deleteImageFile(publicPath) {
  if (!publicPath || !/^\/data\/(images|story-images)\/[^/]+\/[^/]+$/.test(publicPath)) return;
  try { await unlink(join(ROOT, publicPath)); } catch {  }
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

async function handleStatic(req, res, pathname) {

  const rel  = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel === '/' ? 'index.html' : rel);

  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {

    if (rel === '/auth.js') {
      const body = (await readFile(file, 'utf8'))
        .replace('SUPABASE_URL_PLACEHOLDER', SUPABASE_URL || '')
        .replace('SUPABASE_ANON_KEY_PLACEHOLDER', SUPABASE_ANON_KEY || '');
      res.writeHead(200, { 'Content-Type': MIME['.js'] });
      res.end(body);
      return;
    }

    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);

  try {

    if (pathname === '/api/voices'     && req.method === 'GET')  return await handleVoices(req, res);
    if (pathname === '/api/tts'        && req.method === 'POST') return await handleTts(req, res);

    if (pathname === '/api/story' && req.method === 'POST') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleStory(req, res, auth);
    }
    if (pathname === '/api/card' && req.method === 'POST') {
      const auth = await requireAuth(req, res); if (!auth) return;
      return await handleCard(req, res, auth);
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

    return await handleStatic(req, res, pathname);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  console.log(`Dastaan → http://localhost:${PORT}`);
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
