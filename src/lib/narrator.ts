import { synthesize, prefetch } from './speech';
import { getVoice } from './preferences';

type PlaybackOutcome = 'ended' | 'blocked' | 'stalled' | 'error' | 'stopped';
export type StoryOutcome = PlaybackOutcome | 'no-voice';
export type Scene = { text: string; image: string | null };
export type ScenePlayback = { outcome: StoryOutcome; index: number };

const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';

function logEvent(kind: string, detail: Record<string, unknown> = {}) {
  console.log('[lily]', kind, detail);
}

class LipSync {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  buffer: Uint8Array<ArrayBuffer> | null = null;
  raf: number | null = null;
  level = 0;
  sources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  lilyEl: HTMLElement | null = null;
  stageEl: HTMLElement | null = null;
  levelsEl: HTMLElement | null = null;

  setElements(lily: HTMLElement | null, stage: HTMLElement | null, levels: HTMLElement | null) {
    this.lilyEl = lily;
    this.stageEl = stage;
    this.levelsEl = levels;
  }

  ensureGraph(): boolean {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) { logEvent('audio-context-unavailable'); return false; }
      this.ctx = new Ctx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      this.buffer = new Uint8Array(this.analyser.fftSize);
      this.analyser.connect(this.ctx.destination);
      logEvent('audio-context-created', { state: this.ctx.state });
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
        .then(() => logEvent('audio-context-resumed', { state: this.ctx!.state }))
        .catch(() => logEvent('audio-context-resume-failed', { state: this.ctx!.state }));
    }
    return true;
  }

  attach(audio: HTMLAudioElement): boolean {
    if (!this.ensureGraph()) return false;
    if (!this.sources.has(audio)) {
      try {
        const src = this.ctx!.createMediaElementSource(audio);
        src.connect(this.analyser!);
        this.sources.set(audio, src);
      } catch {
        return false;
      }
    }
    return true;
  }

  start() {
    this.stageEl?.classList.add('talking');
    if (this.raf) return;
    const tick = () => {
      this.analyser!.getByteTimeDomainData(this.buffer!);
      let sum = 0;
      for (let i = 0; i < this.buffer!.length; i++) {
        const v = (this.buffer![i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.buffer!.length);

      let target = Math.min(1, Math.max(0, (rms - 0.012) / 0.15));
      target = Math.pow(target, 0.7);

      this.level += (target - this.level) * 0.4;

      const v = this.level.toFixed(3);
      this.lilyEl?.style.setProperty('--mouth-open', v);
      this.levelsEl?.style.setProperty('--level', v);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    this.level = 0;
    this.stageEl?.classList.remove('talking');
    this.lilyEl?.style.setProperty('--mouth-open', '0');
    this.levelsEl?.style.setProperty('--level', '0');
  }

  freeze() {
    this.stop();
  }

  fallback(durationSecs: number) {
    this.stageEl?.classList.add('talking');
    const started = performance.now();
    const tick = () => {
      const t = (performance.now() - started) / 1000;
      if (t > durationSecs) { this.stop(); return; }
      const v = (0.5 + 0.5 * Math.sin(t * 11)) * 0.7 + 0.1;
      this.lilyEl?.style.setProperty('--mouth-open', v.toFixed(3));
      this.levelsEl?.style.setProperty('--level', v.toFixed(3));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  announce() {
    this.stageEl?.classList.add('jumping');
    setTimeout(() => this.stageEl?.classList.remove('jumping'), 600);
  }

  celebrate() {
    this.stageEl?.classList.add('jumping', 'waving');
    setTimeout(() => this.stageEl?.classList.remove('jumping', 'waving'), 900);
  }
}

class Narrator {
  lipSync = new LipSync();
  sharedAudio = new Audio();
  audioUnlocked = false;
  currentAudio: HTMLAudioElement | null = null;
  speakToken = 0;
  voicesReady: Promise<unknown> | null = null;
  isPaused = false;
  private clipWatchdog: { arm: () => void; disarm: () => void } | null = null;
  private errorCb: ((message: string) => void) | null = null;

  constructor() {
    this.sharedAudio.preload = 'auto';
  }

  onError(cb: (message: string) => void) {
    this.errorCb = cb;
  }

  private emitError(message: string) {
    this.errorCb?.(message);
  }

  setVoicesReady(promise: Promise<unknown>) {
    this.voicesReady = promise;
  }

  unlockAudioForSession = () => {
    this.lipSync.ensureGraph();
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    try {
      this.sharedAudio.src = SILENT_WAV;
      this.sharedAudio.play().catch(() => {});
    } catch {
    }
  };

  beginSpeaking(): number {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
    this.lipSync.stop();
    return ++this.speakToken;
  }

  async resolveVoice(): Promise<string> {
    let id = getVoice();
    if (!id) { await this.voicesReady; id = getVoice(); }
    return id;
  }

  async prefetchLine(text: string): Promise<void> {
    if (!text) return;
    const voiceId = await this.resolveVoice();
    if (!voiceId) return;
    prefetch(text, voiceId);
  }

  playClip(url: string, token: number): Promise<PlaybackOutcome> {
    return new Promise(resolve => {
      const audio = this.sharedAudio;
      audio.pause();
      audio.src = url;
      this.currentAudio = audio;

      let settled = false;
      let watchdog: ReturnType<typeof setTimeout>;
      const done = (outcome: PlaybackOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        this.clipWatchdog = null;
        this.lipSync.stop();
        if (outcome !== 'ended') {
          logEvent(`clip-${outcome}`, {
            ctxState: this.lipSync.ctx?.state ?? 'no context',
            networkState: audio.networkState,
            mediaErrorCode: audio.error?.code ?? null,
          });
        }
        resolve(outcome);
      };

      const arm = () => {
        clearTimeout(watchdog);
        const remaining = (audio.duration || 10) - (audio.currentTime || 0);
        watchdog = setTimeout(() => done('stalled'), remaining * 1000 + 8000);
      };
      this.clipWatchdog = { arm, disarm: () => clearTimeout(watchdog) };

      const analysed = this.lipSync.attach(audio);

      audio.onloadedmetadata = () => {
        document.body.classList.remove('preparing');
        if (analysed) this.lipSync.start();
        else this.lipSync.fallback(audio.duration || 2);
        arm();
      };
      audio.onended = () => done('ended');
      audio.onerror = () => done('error');
      audio.onplay = () => { if (analysed) this.lipSync.start(); };
      audio.onpause = () => { if (!settled) this.lipSync.freeze(); };

      audio.play().catch(e =>
        done(e.name === 'NotAllowedError' ? 'blocked' : 'error'),
      );

      watchdog = setTimeout(() => done('stalled'), 30000);
      if (token !== this.speakToken) { audio.pause(); done('ended'); }
    });
  }

  describePlaybackError(outcome: PlaybackOutcome): string {
    if (outcome === 'blocked') return 'Tap once to let it talk, then try again.';
    if (outcome === 'stalled') return "That's taking too long. Try again?";
    return "Couldn't say that. Try again?";
  }

  async speakText(text: string, onNoVoice: () => void) {
    const token = this.beginSpeaking();
    const voiceId = await this.resolveVoice();
    if (!voiceId) { onNoVoice(); return; }

    let url: string;
    try {
      url = await synthesize(text, voiceId);
    } catch (e) {
      if (token === this.speakToken) this.emitError(e instanceof Error ? e.message : 'Could not say that.');
      logEvent('speak-text-error', { message: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (token !== this.speakToken) return;

    const outcome = await this.playClip(url, token);
    if (token === this.speakToken && outcome !== 'ended') this.emitError(this.describePlaybackError(outcome));
  }

  togglePause(): boolean {
    if (!this.currentAudio) return this.isPaused;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.currentAudio.pause();
      this.clipWatchdog?.disarm();
    } else {
      this.clipWatchdog?.arm();
      this.currentAudio.play().catch(() => {});
    }
    return this.isPaused;
  }

  private readonly LOOKAHEAD = 2;

  async playStoryScene(
    scenes: Scene[],
    index: number,
    onScene: (scene: Scene, index: number) => void,
    onNoVoice: () => void,
  ): Promise<ScenePlayback> {
    const token = this.beginSpeaking();
    this.isPaused = false;
    const voiceId = await this.resolveVoice();
    if (!voiceId) { onNoVoice(); return { outcome: 'no-voice', index }; }
    if (token !== this.speakToken) return { outcome: 'stopped', index };

    for (let i = index + 1; i <= index + this.LOOKAHEAD && i < scenes.length; i++) {
      prefetch(scenes[i].text, voiceId);
    }

    let url: string;
    try {
      url = await synthesize(scenes[index].text, voiceId);
    } catch (e) {
      if (token === this.speakToken) this.emitError(e instanceof Error ? e.message : 'Something went wrong.');
      logEvent('speak-story-error', { message: e instanceof Error ? e.message : String(e) });
      return { outcome: 'error', index };
    }
    if (token !== this.speakToken) return { outcome: 'stopped', index };

    onScene(scenes[index], index);
    const outcome = await this.playClip(url, token);
    if (token !== this.speakToken) return { outcome: 'stopped', index };
    if (outcome !== 'ended') this.emitError(this.describePlaybackError(outcome));
    return { outcome, index };
  }
}

export function splitForNarration(text: string, firstMax = 150, restMax = 240): string[] {
  const sentences = text.match(/[^.؟!…]+[.؟!…]*\s*/g) || [text];
  const chunks: string[] = [];
  let buf = '';
  for (const s of sentences) {
    const max = chunks.length === 0 ? firstMax : restMax;
    if (buf && (buf + s).length > max) { chunks.push(buf.trim()); buf = s; }
    else buf += s;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

export const narrator = new Narrator();
