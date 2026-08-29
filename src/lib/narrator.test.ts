import { describe, it, expect } from 'vitest';
import { narrator, splitForNarration } from './narrator';

describe('splitForNarration', () => {
  it('returns the whole text as one chunk when it fits', () => {
    expect(splitForNarration('Hello there.', 150, 240)).toEqual(['Hello there.']);
  });

  it('splits long text on sentence boundaries once a chunk would exceed the max', () => {
    const text = 'This is one sentence. This is another sentence. And a third one here.';
    const chunks = splitForNarration(text, 30, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(60);
    }
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toContain('third one here');
  });

  it('uses a smaller max for the first chunk than the rest', () => {
    const text = 'Short one. '.repeat(10).trim();
    const chunks = splitForNarration(text, 12, 100);
    expect(chunks[0].length).toBeLessThanOrEqual(12 + 'Short one.'.length);
  });
});

describe('narrator.describePlaybackError', () => {
  it('gives a distinct message for blocked, stalled, and other outcomes', () => {
    expect(narrator.describePlaybackError('blocked')).toMatch(/tap once/i);
    expect(narrator.describePlaybackError('stalled')).toMatch(/taking too long/i);
    expect(narrator.describePlaybackError('error')).toMatch(/try again/i);
  });
});
