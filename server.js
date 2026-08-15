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

const PORT     = process.env.PORT || 8000;
const API_KEY  = process.env.ELEVENLABS_API_KEY;
const ROOT     = process.cwd();

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
