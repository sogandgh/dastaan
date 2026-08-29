import { useEffect, useRef, useState } from 'react';
import { narrator, splitForNarration, type Scene } from '../lib/narrator';
import { useToast } from '../context/ToastContext';
import './StoryPlayPanel.css';

type StoryPlayPanelProps = {
  scenes: Scene[];
  label: string;
  onLeaveToSetup: () => void;
};

function stripDeliveryTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function expandLongScenes(scenes: Scene[]): Scene[] {
  const MAX = 260;
  const out: Scene[] = [];
  for (const scene of scenes) {
    if (scene.image || scene.text.length <= MAX) { out.push(scene); continue; }
    splitForNarration(scene.text, MAX, MAX).forEach(text => out.push({ text, image: null }));
  }
  return out;
}

export function StoryPlayPanel({ scenes: rawScenes, label, onLeaveToSetup }: StoryPlayPanelProps) {
  const { showToast } = useToast();
  const [scenes] = useState(() => expandLongScenes(rawScenes));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [repeatMode, setRepeatMode] = useState(false);
  const activeRef = useRef(true);
  const levelsRef = useRef<HTMLDivElement>(null);
  const targetIndexRef = useRef(0);

  useEffect(() => {
    activeRef.current = true;
    narrator.lipSync.levelsEl = levelsRef.current;
    playFrom(0);
    return () => {
      activeRef.current = false;
      narrator.lipSync.levelsEl = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSceneChange(scene: Scene, index: number) {
    setCurrentIndex(index);
    setText(stripDeliveryTags(scene.text));
    if (!scene.image) {
      setImage(null);
      return;
    }
    setChanging(true);
    setTimeout(() => {
      if (!activeRef.current) return;
      setImage(scene.image);
      setChanging(false);
    }, 200);
  }

  async function playFrom(index: number) {
    targetIndexRef.current = index;
    setRepeatMode(false);
    document.body.classList.add('preparing');
    const { outcome } = await narrator.playStoryScene(
      scenes,
      index,
      onSceneChange,
      () => showToast('Pick a narrator voice in Settings first.'),
    );
    document.body.classList.remove('preparing');
    if (!activeRef.current || outcome === 'stopped') return;

    if (outcome !== 'ended') {
      onLeaveToSetup();
      return;
    }
    if (index + 1 < scenes.length) playFrom(index + 1);
    else setRepeatMode(true);
  }

  function goToScene(direction: 1 | -1) {
    const next = (targetIndexRef.current + direction + scenes.length) % scenes.length;
    playFrom(next);
  }

  function handlePauseClick() {
    if (repeatMode) {
      playFrom(0);
      return;
    }
    setIsPaused(narrator.togglePause());
  }

  return (
    <section className="panel panel-play">
      <div className="playing-meta">
        <span className="playing-theme">{label}</span>
        <div className="levels" ref={levelsRef} aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>
        <p className="preparing-note">Getting the story ready</p>
      </div>

      <div className="story-row">
        <button type="button" className="nav-btn" onClick={() => goToScene(-1)} aria-label="Previous scene">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>

        <div className="story-panel">
          {image && <img className={`story-scene${changing ? ' is-changing' : ''}`} src={image} alt="" />}
          <p dir="rtl" lang="fa">{text}</p>
        </div>

        <button type="button" className="nav-btn" onClick={() => goToScene(1)} aria-label="Next scene">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {scenes.length > 1 && (
        <div className="dots">
          {scenes.map((_, i) => (
            <div key={i} className={`dot${i === currentIndex ? ' active' : ''}`} />
          ))}
        </div>
      )}

      <button type="button" className="stop-btn" onClick={handlePauseClick}>
        {repeatMode ? (
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,5V1L7,6l5,5V7c3.31,0,6,2.69,6,6s-2.69,6-6,6s-6-2.69-6-6H4c0,4.42,3.58,8,8,8s8-3.58,8-8S16.42,5,12,5z" /></svg>
        ) : isPaused ? (
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.4v13.2a.6.6 0 0 0 .93.5l10-6.6a.6.6 0 0 0 0-1l-10-6.6a.6.6 0 0 0-.93.5z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="7.5" y="6" width="3.4" height="12" rx="1.4" />
            <rect x="13.1" y="6" width="3.4" height="12" rx="1.4" />
          </svg>
        )}
        <span>{repeatMode ? 'Play again' : isPaused ? 'Play' : 'Pause'}</span>
      </button>
    </section>
  );
}
