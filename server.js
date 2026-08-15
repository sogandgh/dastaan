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
import { readFile }     from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT        = process.env.PORT || 8000;
const API_KEY     = process.env.ELEVENLABS_API_KEY;
const OPENAI_KEY  = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const ROOT        = process.cwd();

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

  const upstream = await fetch(`${API_ROOT}/v2/voices?page_size=100`, {
    headers: { 'xi-api-key': API_KEY },
  });
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

  const upstream = await fetch(
    `${API_ROOT}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUT_FMT}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
    }
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
- Use the zero-width non-joiner correctly (می‌کرد, برگ‌ها).
- If the child is named in the request, write the name لی‌لی.`;
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

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
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
  });

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
    if (pathname === '/api/voices' && req.method === 'GET')  return await handleVoices(res);
    if (pathname === '/api/tts'    && req.method === 'POST') return await handleTts(req, res);
    if (pathname === '/api/story'  && req.method === 'POST') return await handleStory(req, res);
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
