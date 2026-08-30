const DAY_MS = 24 * 60 * 60 * 1000;

export const LIMITS = {
  story: { max: 5, windowMs: DAY_MS, label: 'Stories' },
  card: { max: 50, windowMs: DAY_MS, label: 'Flashcards' },
  talk: { max: 25, windowMs: DAY_MS, label: 'Talk recordings' },
};
