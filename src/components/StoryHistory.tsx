import { useEffect, useState } from 'react';
import { listStories, deleteStory, normalizeScenes, type StoryRecord } from '../lib/stories';

type StoryHistoryProps = {
  onPlay: (record: StoryRecord) => void;
  reloadToken: number;
};

export function StoryHistory({ onPlay, reloadToken }: StoryHistoryProps) {
  const [stories, setStories] = useState<StoryRecord[]>([]);

  useEffect(() => {
    listStories().then(setStories);
  }, [reloadToken]);

  async function remove(id: string) {
    await deleteStory(id);
    setStories(await listStories());
  }

  if (stories.length === 0) return null;

  return (
    <section className="history">
      <h2 className="history-title">Stories you've made</h2>
      <p className="history-sub">Tap to hear one again.</p>
      <ul className="history-list">
        {stories.map(rec => (
          <li key={rec._key} className="history-item">
            <button
              type="button"
              className="history-play"
              onClick={() => onPlay({ ...rec, scenes: normalizeScenes(rec) })}
            >
              <span className="history-label" dir="auto">{rec.label}</span>
              <span className="history-meta">{rec.minutes} min{rec.minutes > 1 ? 's' : ''}</span>
            </button>
            <button type="button" className="history-del" aria-label={`Remove ${rec.label}`} onClick={() => remove(rec._key)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
