import { apiFetch, describeError } from './api';
import { getVoice, setVoice } from './preferences';

export type Voice = {
  voice_id: string;
  name: string;
  labels: { age?: string; gender?: string; accent?: string };
};

export async function listVoices(): Promise<Voice[]> {
  const res = await apiFetch('/api/voices');
  if (!res.ok) throw new Error(await describeError(res));
  const data = await res.json();
  return data.voices || [];
}

export function ensureAllowedVoice(voices: Voice[]): string {
  const saved = getVoice();
  if (saved && voices.some(v => v.voice_id === saved)) return saved;
  if (voices.length === 0) return saved;

  const preferred = voices.find(v => v.name.split(' - ')[0].trim() === 'Jessica') || voices[0];
  setVoice(preferred.voice_id);
  return preferred.voice_id;
}
