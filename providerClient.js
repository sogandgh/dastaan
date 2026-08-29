import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './env.js';

export const ELEVENLABS_FRIENDLY_ERROR = "The voice isn't working right now. Try again in a bit.";
export const OPENAI_FRIENDLY_ERROR = "Couldn't do that right now. Try again in a bit.";
const ERROR_LOG_FILE = join(DATA_DIR, 'errors.log');

export async function fetchWithTimeout(url, options = {}, ms = 20000, externalSignal) {
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

export async function openaiErrorMessage(upstream) {
  try {
    const body = await upstream.json();
    return body?.error?.message || `OpenAI error ${upstream.status}.`;
  } catch {
    return `OpenAI error ${upstream.status}.`;
  }
}

export async function logServerError(provider, detail, who) {
  const line = `[${new Date().toISOString()}]${who ? ` [${who}]` : ''} ${provider}: ${detail}`;
  console.error(line);
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(ERROR_LOG_FILE, line + '\n');
  } catch {  }
}
