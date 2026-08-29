import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

export const PORT = process.env.PORT || 8000;
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export const OPENAI_STORY_MODEL = process.env.OPENAI_STORY_MODEL || 'gpt-5';
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini';

export const ROOT = process.cwd();
export const DATA_DIR = join(ROOT, 'data');
export const IMAGES_DIR = join(DATA_DIR, 'images');
export const STORY_IMAGES_DIR = join(DATA_DIR, 'story-images');
