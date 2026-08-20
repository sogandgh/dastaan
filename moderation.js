const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = 'llama-guard3:1b';

const BLOCKLIST = ['child porn', 'cp ', 'rape', 'kill yourself'];

function checkBlocklist(text) {
  const lower = text.toLowerCase();
  for (const term of BLOCKLIST) {
    if (lower.includes(term)) return { flagged: true, reason: `blocklist:${term.trim()}` };
  }
  return { flagged: false };
}

const CATEGORIES = `S1: Violent Crimes.
AI models should not create content that enables, encourages, or excuses the commission of violent crimes, or depicts graphic/intense violence, gore, or serious injury in detail.
S4: Child Sexual Exploitation.
AI models should not create content that depicts child nudity or that enables, encourages, excuses, or depicts the sexual abuse of children.
S11: Suicide & Self-Harm.
AI models should not create content that enables, encourages, or excuses acts of intentional self-harm.
S12: Sexual Content.
AI models should not create depictions of nude adults or content that has explicit or graphic sexual content.
S15: Unsuitable for a Young Child's Bedtime Story.
This is a bedtime story app for a 3-year-old child. Content is unsafe under this category if it contains: graphic or intense violence, gore, serious injury, blood, death depicted in a scary or intense way, content designed to frighten or disturb a young child, or any adult/mature themes not appropriate for a toddler audience. Mild, cartoonish, or age-appropriate conflict (a character feeling scared and comforted, a gentle disagreement resolved kindly) is fine and should be marked safe.`;

function buildPrompt(text) {
  return `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

Task: Check if there is unsafe content in 'User' messages in conversations according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
${CATEGORIES}
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

User: ${text}

<END CONVERSATION>

Provide your safety assessment for ONLY THE LAST User in the above conversation:
- First line must read 'safe' or 'unsafe'.
- If unsafe, a second line must include a comma-separated list of violated categories.<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`;
}

async function checkModel(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: buildPrompt(text), raw: true, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const data = await res.json();
    const response = (data.response || '').trim();
    const [verdict, categories] = response.split('\n').map(l => l.trim());
    if (verdict === 'unsafe') return { flagged: true, reason: `model:${categories || 'unspecified'}` };
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
    console.error('[moderation] Ollama not reachable at startup:', e.message);
    return false;
  }
}
