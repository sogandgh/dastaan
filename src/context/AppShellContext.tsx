import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { LANGUAGES, languageOf } from '../../languages.js';
import { getLanguage, setLanguage as persistLanguage } from '../lib/preferences';
import type { AppMode } from '../lib/mode';

type AppShellContextValue = {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  language: string;
  setLanguage: (code: string) => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode>('learn');
  const [language, setLanguageState] = useState(getLanguage());

  useEffect(() => {
    document.body.dataset.mode = mode;
  }, [mode]);

  useEffect(() => {
    const lang = languageOf(language);
    document.documentElement.style.setProperty('--lang-font', lang.font);
  }, [language]);

  function setLanguage(code: string) {
    const next = LANGUAGES[code as keyof typeof LANGUAGES] ? code : 'fa';
    persistLanguage(next);
    setLanguageState(next);
  }

  return (
    <AppShellContext.Provider value={{ mode, setMode, language, setLanguage }}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell(): AppShellContextValue {
  const value = useContext(AppShellContext);
  if (!value) throw new Error('useAppShell must be used inside an AppShellProvider.');
  return value;
}
