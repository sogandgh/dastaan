import { useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { useToast } from '../context/ToastContext';
import { narrator } from '../lib/narrator';
import { sendTalkMessage } from '../lib/talk';
import { useRecorder } from '../lib/useRecorder';
import './TalkPanel.css';

export function TalkPanel() {
  const { language } = useAppShell();
  const { showToast } = useToast();
  const { recording, start, stop } = useRecorder();
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');

  async function handleRecordingDone(blob: Blob) {
    if (blob.size === 0) return;
    setThinking(true);
    try {
      const result = await sendTalkMessage(blob, language);
      setTranscript(result.transcript);
      setReply(result.reply);
      narrator.speakText(result.reply, () => showToast('Pick a narrator voice in Settings first.'));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setThinking(false);
    }
  }

  async function handleMicClick() {
    if (recording) {
      stop();
      return;
    }
    setTranscript('');
    setReply('');
    try {
      await start(handleRecordingDone);
    } catch {
      showToast("Couldn't reach the microphone. Check this site's microphone permission.");
    }
  }

  return (
    <section className="panel panel-talk">
      <div className="talk-head">
        <h1>Talk with Lily</h1>
        <p>Tap the microphone and say hello!</p>
      </div>

      <button
        type="button"
        className={`mic-btn${recording ? ' is-recording' : ''}`}
        onClick={handleMicClick}
        disabled={thinking}
        aria-label={recording ? 'Stop recording' : 'Start talking'}
      >
        {recording ? (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v3" />
          </svg>
        )}
      </button>

      <p className="talk-status">
        {recording ? 'Listening…' : thinking ? 'Lily is thinking…' : ''}
      </p>

      {!recording && !thinking && (transcript || reply) && (
        <div className="talk-exchange">
          {transcript && <p className="talk-said" dir="auto">You said: {transcript}</p>}
          {reply && <p className="talk-reply" dir="rtl" lang="fa">{reply}</p>}
        </div>
      )}
    </section>
  );
}
