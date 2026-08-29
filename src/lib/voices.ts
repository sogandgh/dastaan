import { apiFetch, describeError } from './api';

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
