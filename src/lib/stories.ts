import { apiFetch, describeError } from './api';
import { getLanguage } from './preferences';
import type { Scene } from './narrator';

export type StoryRecord = {
  id: string;
  _key: string;
  label: string;
  minutes: number;
  characters?: string;
  scenes: Scene[];
};

export function normalizeScenes(rec: unknown): Scene[] {
  if (typeof rec === 'string') return [{ text: rec, image: null }];
  const record = rec as { scenes?: Scene[]; story?: string } | null;
  if (Array.isArray(record?.scenes)) return record.scenes;
  if (record?.story) return [{ text: record.story, image: null }];
  return [];
}

export async function getStory(options: {
  prompt?: string;
  focus?: string;
  minutes: number;
  label?: string;
  signal: AbortSignal;
}): Promise<{ id: string; characters: string; scenes: Scene[] }> {
  const res = await apiFetch('/api/story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: options.prompt || '',
      focus: options.focus || '',
      minutes: options.minutes,
      label: options.label || '',
      language: getLanguage(),
    }),
    signal: options.signal,
  });
  if (!res.ok) throw new Error(await describeError(res));

  const { id, characters, scenes } = await res.json();
  return { id, characters, scenes: normalizeScenes({ scenes }) };
}

export async function listStories(): Promise<StoryRecord[]> {
  try {
    const res = await apiFetch(`/api/stories?language=${encodeURIComponent(getLanguage())}`);
    if (!res.ok) return [];
    const { stories } = await res.json();
    return (stories || []).map((r: StoryRecord) => ({ ...r, _key: r.id }));
  } catch {
    return [];
  }
}

export async function deleteStory(id: string): Promise<void> {
  try {
    await apiFetch(`/api/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
  }
}
