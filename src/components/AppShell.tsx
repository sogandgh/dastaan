import { useEffect, useRef, useState } from 'react';
import { AppShellProvider, useAppShell } from '../context/AppShellContext';
import { ToastProvider, useToast } from '../context/ToastContext';
import { Topbar } from './Topbar';
import { SettingsModal } from './SettingsModal';
import { Lily } from './Lily';
import { Toast } from './Toast';
import { LearnPanel } from './LearnPanel';
import { StoryFlow } from './StoryFlow';
import { TalkPanel } from './TalkPanel';
import { languageOf } from '../../languages.js';
import { narrator } from '../lib/narrator';
import { listVoices } from '../lib/voices';
import './AppShell.css';

const GREETINGS = ['سلام', 'خوبی؟', 'خداحافظ'];

function AppShellChrome() {
  const { mode, setMode, language, setLanguage } = useAppShell();
  const { showToast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const greetingIndex = useRef(0);

  useEffect(() => {
    narrator.onError(showToast);
    narrator.setVoicesReady(listVoices().catch(() => []));
    document.addEventListener('pointerdown', narrator.unlockAudioForSession, { capture: true });
    return () => document.removeEventListener('pointerdown', narrator.unlockAudioForSession, { capture: true });
  }, [showToast]);

  useEffect(() => {
    narrator.lipSync.setElements(document.getElementById('lily'), stageRef.current, null);
  }, []);

  function tapLily() {
    if (mode === 'play') return;
    const greeting = GREETINGS[greetingIndex.current % GREETINGS.length];
    greetingIndex.current += 1;
    narrator.speakText(greeting, () => showToast('Pick a narrator voice in Settings first.'));
  }

  return (
    <>
      <a className="skip-link" href="#main-stage">Skip to content</a>
      <div className="backdrop" aria-hidden="true" />

      <Topbar
        mode={mode}
        nativeLanguageName={languageOf(language).native}
        onModeChange={setMode}
        onBack={() => { narrator.beginSpeaking(); setMode('setup'); }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="stage" id="main-stage">
        <Lily ref={stageRef} onTap={tapLily} />
        {mode === 'learn' ? <LearnPanel /> : mode === 'talk' ? <TalkPanel /> : <StoryFlow />}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={language}
        onLanguageChange={setLanguage}
      />

      <Toast />
    </>
  );
}

export function AppShell() {
  return (
    <AppShellProvider>
      <ToastProvider>
        <AppShellChrome />
      </ToastProvider>
    </AppShellProvider>
  );
}
