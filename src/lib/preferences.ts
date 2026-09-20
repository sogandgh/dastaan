import { DEFAULT_LANGUAGE } from '../../languages.js';

const LS_VOICE = 'lily.elevenlabs.voice';
const LS_LANGUAGE = 'lily.language';

export function getVoice(): string {
  return localStorage.getItem(LS_VOICE) || '';
}

export function setVoice(voiceId: string) {
  if (voiceId) localStorage.setItem(LS_VOICE, voiceId);
  else localStorage.removeItem(LS_VOICE);
}

export function getLanguage(): string {
  return localStorage.getItem(LS_LANGUAGE) || DEFAULT_LANGUAGE;
}

export function setLanguage(code: string) {
  localStorage.setItem(LS_LANGUAGE, code);
}

const LS_GAME_CATEGORIES = 'lily.game.categories';

export function getGameCategories(): string[] | null {
  const raw = localStorage.getItem(LS_GAME_CATEGORIES);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(v => typeof v === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

export function setGameCategories(keys: string[]) {
  if (keys.length === 0) localStorage.removeItem(LS_GAME_CATEGORIES);
  else localStorage.setItem(LS_GAME_CATEGORIES, JSON.stringify(keys));
}
