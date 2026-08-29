import { OPENAI_API_KEY } from './env.js';

const BLOCKLIST = ['child porn', 'cp ', 'rape', 'kill yourself'];

function checkBlocklist(text) {
  const lower = text.toLowerCase();
  for (const term of BLOCKLIST) {
    if (lower.includes(term)) return { flagged: true, reason: `blocklist:${term.trim()}` };
  }
  return { flagged: false };
}

async function checkModel(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OpenAI moderation returned ${res.status}`);
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) throw new Error('OpenAI moderation returned no result');
    if (result.flagged) {
      const categories = Object.entries(result.categories)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(',');
      return { flagged: true, reason: `openai:${categories || 'unspecified'}` };
    }
    return { flagged: false };
  } catch (e) {
    const err = new Error('Moderation check unavailable.');
    err.unavailable = true;
    err.cause = e;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function moderateText(text) {
  if (!text || !text.trim()) return { flagged: false };
  const blocklistResult = checkBlocklist(text);
  if (blocklistResult.flagged) return blocklistResult;
  return checkModel(text);
}

export async function warmUp() {
  try {
    await checkModel('hello');
    return true;
  } catch (e) {
    console.error('[moderation] OpenAI moderation not reachable at startup:', e.message);
    return false;
  }
}
