import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { ChooseLanguagePage } from './ChooseLanguagePage';

export function HomePage() {
  const [languageChosen, setLanguageChosen] = useState(false);

  if (!languageChosen) {
    return <ChooseLanguagePage onChoose={() => setLanguageChosen(true)} />;
  }

  return <AppShell />;
}
