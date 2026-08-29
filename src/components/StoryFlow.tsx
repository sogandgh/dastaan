import { useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { StorySetupPanel } from './StorySetupPanel';
import { StoryPlayPanel } from './StoryPlayPanel';
import type { Scene } from '../lib/narrator';

export function StoryFlow() {
  const { mode, setMode } = useAppShell();
  const [activeStory, setActiveStory] = useState<{ scenes: Scene[]; label: string } | null>(null);

  function handleStart(scenes: Scene[], label: string) {
    setActiveStory({ scenes, label });
    setMode('play');
  }

  if (mode === 'play' && activeStory) {
    return (
      <StoryPlayPanel
        scenes={activeStory.scenes}
        label={activeStory.label}
        onLeaveToSetup={() => setMode('setup')}
      />
    );
  }

  return <StorySetupPanel onStart={handleStart} />;
}
