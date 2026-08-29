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
