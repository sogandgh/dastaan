import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SettingsModal } from './SettingsModal';
import { listVoices } from '../lib/voices';
import { signOut } from '../lib/supabase';

vi.mock('../lib/voices', async () => {
  const actual = await vi.importActual<typeof import('../lib/voices')>('../lib/voices');
  return { ...actual, listVoices: vi.fn() };
});
vi.mock('../lib/supabase', () => ({ signOut: vi.fn() }));

beforeEach(() => {
  vi.mocked(listVoices).mockReset();
  vi.mocked(signOut).mockReset();
  localStorage.clear();
});

const femaleYoungVoice = { voice_id: 'v1', name: 'Jessica - warm', labels: { age: 'young', gender: 'female', accent: 'American' } };

describe('SettingsModal', () => {
  it('lists languages and loads voices when opened', async () => {
    vi.mocked(listVoices).mockResolvedValue([femaleYoungVoice]);

    render(
      <SettingsModal open onClose={vi.fn()} language="fa" onLanguageChange={vi.fn()} />,
    );

    expect(screen.getByRole('option', { name: 'Farsi' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Swedish' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('1 voices.')).toBeInTheDocument();
    });
  });

  it('migrates away from a previously saved voice no longer in the list', async () => {
    localStorage.setItem('lily.elevenlabs.voice', 'some-old-male-voice');
    vi.mocked(listVoices).mockResolvedValue([femaleYoungVoice]);

    render(
      <SettingsModal open onClose={vi.fn()} language="fa" onLanguageChange={vi.fn()} />,
    );

    await waitFor(() => {
      expect(localStorage.getItem('lily.elevenlabs.voice')).toBe('v1');
    });
    expect(await screen.findByDisplayValue(/Jessica/)).toBeInTheDocument();
  });

  it('calls onLanguageChange when a different language is picked', async () => {
    vi.mocked(listVoices).mockResolvedValue([]);
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();

    render(
      <SettingsModal open onClose={vi.fn()} language="fa" onLanguageChange={onLanguageChange} />,
    );

    await user.selectOptions(screen.getByLabelText('Language'), 'sv');
    expect(onLanguageChange).toHaveBeenCalledWith('sv');
  });

  it('calls signOut when Sign out is clicked', async () => {
    vi.mocked(listVoices).mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <SettingsModal open onClose={vi.fn()} language="fa" onLanguageChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
  });
});
