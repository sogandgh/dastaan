import { useState, type ReactNode } from 'react';
import { AppShellProvider, useAppShell } from '../context/AppShellContext';
import { Topbar } from './Topbar';
import { SettingsModal } from './SettingsModal';
import { languageOf } from '../../languages.js';
import './AppShell.css';

function AppShellChrome({ children }: { children: ReactNode }) {
  const { mode, setMode, language, setLanguage } = useAppShell();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <a className="skip-link" href="#main-stage">Skip to content</a>
      <div className="backdrop" aria-hidden="true" />

      <Topbar
        mode={mode}
        nativeLanguageName={languageOf(language).native}
        onModeChange={setMode}
        onBack={() => setMode('setup')}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="stage" id="main-stage">
        {children}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={language}
        onLanguageChange={setLanguage}
      />
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppShellProvider>
      <AppShellChrome>{children}</AppShellChrome>
    </AppShellProvider>
  );
}
