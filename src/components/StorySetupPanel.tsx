import { useRef, useState } from 'react';
import { THEMES, LENGTHS, type Theme } from '../lib/themes';
import { getStory } from '../lib/stories';
import { StoryHistory } from './StoryHistory';
import type { Scene } from '../lib/narrator';
import type { StoryRecord } from '../lib/stories';
import './StorySetupPanel.css';

type StorySetupPanelProps = {
  onStart: (scenes: Scene[], label: string) => void;
};

export function StorySetupPanel({ onStart }: StorySetupPanelProps) {
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState(1);
  const [prompt, setPrompt] = useState('');
  const [note, setNote] = useState('');
  const [noteIsError, setNoteIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyReloadToken, setHistoryReloadToken] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  async function startStory() {
    if (controllerRef.current) {
      controllerRef.current.abort();
      return;
    }

    const custom = prompt.trim();
    if (!selectedTheme && !custom) {
      setNote('Pick a focus, or type your own.');
      setNoteIsError(true);
      return;
    }

    setNoteIsError(false);
    setNote('Writing your story…');
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;

    let scenes: Scene[];
    let label: string;
    try {
      const result = await getStory({
        prompt: custom,
        focus: selectedTheme?.focus || '',
        minutes: selectedMinutes,
        label: custom || selectedTheme?.label || 'A story',
        signal: controller.signal,
      });
      scenes = result.scenes;
      label = selectedTheme?.label || custom || 'A story for you';
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === 'AbortError';
      controllerRef.current = null;
      setLoading(false);
      setNote(cancelled ? '' : e instanceof Error ? e.message : 'Something went wrong.');
      setNoteIsError(!cancelled);
      return;
    }

    controllerRef.current = null;
    setLoading(false);
    setNote('');
    setPrompt('');
    setHistoryReloadToken(t => t + 1);
    onStart(scenes, label);
  }

  function playFromHistory(record: StoryRecord) {
    onStart(record.scenes, record.label);
  }

  return (
    <section className="panel panel-setup">
      <div className="setup-form">
        <div className="setup-head">
          <h1>Tonight's story</h1>
          <p>Pick something to practise, or ask for anything you like.</p>
        </div>

        <div className="themes" role="group" aria-label="Story focus">
          {THEMES.map(theme => (
            <button
              type="button"
              key={theme.id}
              className={`theme${selectedTheme?.id === theme.id ? ' is-active' : ''}`}
              style={{ color: theme.color }}
              onClick={() => setSelectedTheme(t => (t?.id === theme.id ? null : theme))}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: theme.icon }} />
              <span>{theme.label}</span>
            </button>
          ))}
        </div>

        <div className="custom-idea">
          <span className="custom-idea-or" aria-hidden="true">or</span>
          <label className="sr-only" htmlFor="story-prompt">Type your own story idea</label>
          <input
            id="story-prompt"
            type="text"
            className="custom-idea-input"
            dir="auto"
            autoComplete="off"
            placeholder="type your own idea, like a bear who bakes bread"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
        </div>

        <div className="setup-footer">
          <div className="lengths" role="group" aria-label="Story length">
            {LENGTHS.map(l => (
              <button
                type="button"
                key={l.minutes}
                className={`length${l.minutes === selectedMinutes ? ' is-active' : ''}`}
                onClick={() => setSelectedMinutes(l.minutes)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button type="button" className="start-btn" onClick={startStory}>
            {loading ? 'Cancel' : 'Start the story'}
          </button>
          {loading && <div className="loading-bar"><div className="loading-bar-fill" /></div>}
          <p className={`note${noteIsError ? ' error' : ''}${loading ? ' is-loading' : ''}`}>{note}</p>
        </div>
      </div>

      <StoryHistory onPlay={playFromHistory} reloadToken={historyReloadToken} />
    </section>
  );
}
