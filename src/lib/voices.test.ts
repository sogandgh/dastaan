import { describe, it, expect, beforeEach } from 'vitest';
import { ensureAllowedVoice, type Voice } from './voices';
import { getVoice } from './preferences';

const LS_VOICE = 'lily.elevenlabs.voice';

const voices: Voice[] = [
  { voice_id: 'jessica-id', name: 'Jessica - Playful, Bright, Warm', labels: { age: 'young', gender: 'female' } },
  { voice_id: 'laura-id', name: 'Laura - Enthusiast', labels: { age: 'young', gender: 'female' } },
];

beforeEach(() => {
  localStorage.clear();
});

describe('ensureAllowedVoice', () => {
  it('keeps the saved voice when it is still in the allowed list', () => {
    localStorage.setItem(LS_VOICE, 'laura-id');
    const result = ensureAllowedVoice(voices);
    expect(result).toBe('laura-id');
    expect(getVoice()).toBe('laura-id');
  });

  it('migrates to Jessica when nothing is saved yet', () => {
    const result = ensureAllowedVoice(voices);
    expect(result).toBe('jessica-id');
    expect(getVoice()).toBe('jessica-id');
  });

  it('migrates away from a voice that is no longer allowed', () => {
    localStorage.setItem(LS_VOICE, 'some-old-male-voice-id');
    const result = ensureAllowedVoice(voices);
    expect(result).toBe('jessica-id');
    expect(getVoice()).toBe('jessica-id');
  });

  it('falls back to the first voice when Jessica is not in the list', () => {
    const withoutJessica = [voices[1]];
    const result = ensureAllowedVoice(withoutJessica);
    expect(result).toBe('laura-id');
  });

  it('leaves the stale saved id alone when the list is empty (nothing to migrate to)', () => {
    localStorage.setItem(LS_VOICE, 'some-old-male-voice-id');
    const result = ensureAllowedVoice([]);
    expect(result).toBe('some-old-male-voice-id');
  });
});
