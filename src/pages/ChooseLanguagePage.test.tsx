import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ChooseLanguagePage } from './ChooseLanguagePage';
import { setLanguage } from '../lib/preferences';
import { LANGUAGES } from '../../languages.js';

vi.mock('../lib/preferences', () => ({
  setLanguage: vi.fn(),
  getLanguage: vi.fn(() => 'fa'),
}));

beforeEach(() => {
  vi.mocked(setLanguage).mockReset();
});

describe('ChooseLanguagePage', () => {
  it('shows a card for every language in the registry', () => {
    render(<ChooseLanguagePage onChoose={vi.fn()} />);
    for (const lang of Object.values(LANGUAGES)) {
      expect(screen.getByText(lang.native)).toBeInTheDocument();
    }
  });

  it('persists the pick and calls onChoose when a language card is tapped', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<ChooseLanguagePage onChoose={onChoose} />);

    await user.click(screen.getByText(LANGUAGES.sv.native));

    expect(setLanguage).toHaveBeenCalledWith('sv');
    expect(onChoose).toHaveBeenCalled();
  });
});
