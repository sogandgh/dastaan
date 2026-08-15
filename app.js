import {
  synthesize, prefetch, listVoices, clearCache, getVoice, setVoice,
  getStory, listStories, deleteStory, normalizeScenes,
  createCollection, deleteCollection, getVocabulary,
  generateCard, saveCard, listCards, deleteCard,
} from './tts.js';

const blueyEl   = document.getElementById('bluey');
const stageEl   = document.querySelector('.bluey-stage');
const levelsEl  = document.getElementById('levels');
const toastEl   = document.getElementById('toast');

// ============================================================
//   DIAGNOSTICS  — a small rolling log, kept for when audio fails on a
//   phone we don't have live access to. Nothing here is sent anywhere; it
//   sits in localStorage until someone taps "Copy diagnostics" in Settings
//   and pastes it into a message. Only meaningful state changes and
//   failures are logged (not every successful clip), so it stays useful
//   without filling up on normal, working days.
// ============================================================
const LOG_KEY = 'bluey.debug.log';
const LOG_MAX = 60;

function logEvent(kind, detail = {}) {
  console.log('[bluey]', kind, detail);
  try {
    const log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    log.push({ t: new Date().toISOString(), kind, ...detail });
    while (log.length > LOG_MAX) log.shift();
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch { /* logging must never be the reason something else breaks */ }
}

async function copyDiagnostics() {
  let log = [];
  try { log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { /* empty log is fine */ }
  const text = JSON.stringify({
    when: new Date().toISOString(),
    userAgent: navigator.userAgent,
    audioContextState: lipSync.ctx?.state || 'not created yet',
    voice: getVoice(),
    log,
  }, null, 2);

  try {
    await navigator.clipboard.writeText(text);
    showError('Copied — paste it wherever you’re reporting the issue.');
  } catch {
    // The clipboard API needs a secure (https) context, which this app
    // doesn't have — fall back to something that can be copied by hand.
    diagnosticsOutput.value = text;
    diagnosticsOutput.hidden = false;
    diagnosticsOutput.select();
  }
}

// ============================================================
//   LIP SYNC  — driven by the audio itself
//   The mouth used to cycle through canned shapes on a timer, which is why
//   it looked wrong: it had no relationship to what was being said. Now the
//   playing audio runs through an analyser and the mouth opens by loudness.
// ============================================================
const lipSync = {
  ctx: null,
  analyser: null,
  buffer: null,
  raf: null,
  level: 0,
  sources: new WeakMap(),

  ensureGraph() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
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
        .then(() => logEvent('audio-context-resumed', { state: this.ctx.state }))
        .catch(() => logEvent('audio-context-resume-failed', { state: this.ctx.state }));
    }
    return true;
  },

  /** Route an <audio> through the analyser. Safe to call repeatedly. */
  attach(audio) {
    if (!this.ensureGraph()) return false;
    if (!this.sources.has(audio)) {
      try {
        const src = this.ctx.createMediaElementSource(audio);
        src.connect(this.analyser);
        this.sources.set(audio, src);
      } catch {
        return false;   // already routed, or blocked — fall back to a timer
      }
    }
    return true;
  },

  start() {
    stageEl.classList.add('talking');
    if (this.raf) return;
    const tick = () => {
      this.analyser.getByteTimeDomainData(this.buffer);
      let sum = 0;
      for (let i = 0; i < this.buffer.length; i++) {
        const v = (this.buffer[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.buffer.length);

      // Speech sits roughly between 0.015 and 0.18 RMS; stretch that to 0..1
      // and curve it so ordinary syllables read clearly instead of only peaks.
      let target = Math.min(1, Math.max(0, (rms - 0.012) / 0.15));
      target = Math.pow(target, 0.7);

      // Ease toward the target so the jaw has weight rather than snapping.
      this.level += (target - this.level) * 0.4;

      const v = this.level.toFixed(3);
      blueyEl.style.setProperty('--mouth-open', v);
      levelsEl?.style.setProperty('--level', v);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },

  stop() {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    this.level = 0;
    stageEl.classList.remove('talking');
    blueyEl.style.setProperty('--mouth-open', '0');
    levelsEl?.style.setProperty('--level', '0');
  },

  /** Pause: hold the mouth shut but keep the clip alive for resuming. */
  freeze() {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    this.level = 0;
    stageEl.classList.remove('talking');
    blueyEl.style.setProperty('--mouth-open', '0');
    levelsEl?.style.setProperty('--level', '0');
  },

  /** Used when the analyser is unavailable: a soft, speech-paced flutter. */
  fallback(durationSecs) {
    stageEl.classList.add('talking');
    const started = performance.now();
    const tick = () => {
      const t = (performance.now() - started) / 1000;
      if (t > durationSecs) { this.stop(); return; }
      const v = (0.5 + 0.5 * Math.sin(t * 11)) * 0.7 + 0.1;
      blueyEl.style.setProperty('--mouth-open', v.toFixed(3));
      levelsEl?.style.setProperty('--level', v.toFixed(3));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },
};

// ============================================================
//   AUDIO UNLOCK  — iOS Safari specific
//   Safari only allows audio.play() when it can trace back, synchronously,
//   to a real user gesture. Starting a story does `await getStory(...)`
//   (an LLM call, several seconds) before the first audio.play() — by then
//   the gesture is long gone, so play() is silently denied and the app
//   falls back out of story mode with nothing having played.
//
//   Priming a *throwaway* Audio element on the first tap (an earlier version
//   of this fix) didn't hold up: Safari's unlock allowance is scoped to the
//   specific element that was played via a direct gesture, not to the page
//   as a whole — a later `new Audio(url)` is a different element and starts
//   unblessed again. The reliable version reuses ONE element for every clip
//   the app ever plays (words, greetings, every story chunk), so the exact
//   element that got blessed on first tap is the same one still playing
//   five minutes and one LLM call later.
//
//   There is a second, separate unlock hiding here: the first time any clip
//   plays, lip sync routes `sharedAudio` through a Web Audio graph
//   (createMediaElementSource → analyser → destination) — and from that
//   moment on, ALL of its sound depends on that AudioContext being
//   'running', not just on the element being allowed to play. Resuming a
//   suspended AudioContext also needs a trusted gesture, same as
//   audio.play(). A story that plays through — text and pictures advancing
//   right on schedule, no error — but with no sound at all is exactly what
//   a *still-suspended* context looks like: the element's own play()
//   already got blessed, so play() succeeds and the clip runs its full
//   duration on mute, silently. Resuming used to get exactly one
//   trusted-gesture attempt, ever ({ once: true }) — if that first attempt
//   didn't fully take (plausible before the audio hardware has warmed up
//   at all), nothing ever tried again for the rest of that page load.
//   Every tap now gets another shot at it; resuming an already-running
//   context is a harmless no-op, so this costs nothing when it's not needed.
// ============================================================
const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';
const sharedAudio = new Audio();
sharedAudio.preload = 'auto';
let audioUnlocked = false;

function unlockAudioForSession() {
  lipSync.ensureGraph();   // safe every time: a no-op once the context is already running
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    sharedAudio.src = SILENT_WAV;
    sharedAudio.play().catch(() => {});
  } catch { /* best effort — a failed unlock just means the old behaviour */ }
}
document.addEventListener('pointerdown', unlockAudioForSession, { capture: true });

// ============================================================
//   SPEECH
// ============================================================
let currentAudio = null;
let speakToken   = 0;
let voicesReady  = null;
let clipWatchdog = null;   // lets pause suspend the current clip's stall timer
let isPaused     = false;

function beginSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  lipSync.stop();
  return ++speakToken;
}

async function resolveVoice() {
  let id = getVoice();
  if (!id) { await voicesReady; id = getVoice(); }
  return id;
}

function playClip(url, token) {
  return new Promise(resolve => {
    // Reuse the one blessed element (see AUDIO UNLOCK above) rather than
    // `new Audio(url)` — a fresh element here would need its own gesture.
    const audio = sharedAudio;
    audio.pause();
    audio.src = url;
    currentAudio = audio;

    let settled = false;
    let watchdog = null;
    const done = outcome => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      clipWatchdog = null;
      lipSync.stop();
      // 'ended' is the normal case, every single clip — logging that would
      // just bury the signal. Anything else is exactly what's useful to
      // have on hand after the fact: what the AudioContext's state actually
      // was at the moment sound didn't come out.
      if (outcome !== 'ended') {
        logEvent(`clip-${outcome}`, {
          ctxState: lipSync.ctx?.state ?? 'no context',
          networkState: audio.networkState,
          mediaErrorCode: audio.error?.code ?? null,
        });
      }
      resolve(outcome);
    };

    // A paused clip must not trip the stall watchdog, so the arm/disarm is
    // exposed for togglePause to drive.
    const arm = () => {
      clearTimeout(watchdog);
      const remaining = (audio.duration || 10) - (audio.currentTime || 0);
      watchdog = setTimeout(() => done('stalled'), remaining * 1000 + 8000);
    };
    clipWatchdog = { arm, disarm: () => clearTimeout(watchdog) };

    const analysed = lipSync.attach(audio);

    audio.onloadedmetadata = () => {
      document.body.classList.remove('preparing');   // sound is about to start
      if (analysed) lipSync.start();
      else lipSync.fallback(audio.duration || 2);
      arm();
    };
    audio.onended = () => done('ended');
    audio.onerror = () => done('error');
    audio.onplay  = () => { if (analysed) lipSync.start(); };
    audio.onpause = () => { if (!settled) lipSync.freeze(); };

    audio.play().catch(e =>
      done(e.name === 'NotAllowedError' ? 'blocked' : 'error')
    );

    watchdog = setTimeout(() => done('stalled'), 30000);
    if (token !== speakToken) { audio.pause(); done('ended'); }
  });
}

/** playClip only ever resolves 'ended', 'blocked', 'error', or 'stalled' —
 *  a plain-language line for whichever of the last three actually happened. */
function describePlaybackError(outcome) {
  if (outcome === 'blocked') return 'Tap Bluey once to let him talk, then try again.';
  if (outcome === 'stalled') return "That's taking too long. Try again?";
  return "Bluey couldn't say that. Try again?";
}

async function speakText(text) {
  const token = beginSpeaking();
  const voiceId = await resolveVoice();
  if (!voiceId) { openSettings(); return; }

  let url;
  try {
    url = await synthesize(text, voiceId);
  } catch (e) {
    if (token === speakToken) showError(e.message);
    logEvent('speak-text-error', { message: e.message });
    return;
  }
  if (token !== speakToken) return;

  // Previously fire-and-forget — a failure here (blocked, a stall, a
  // decode error) had nowhere to go and nothing was ever shown for it.
  const outcome = await playClip(url, token);
  if (token === speakToken && outcome !== 'ended') showError(describePlaybackError(outcome));
}

/** Short opening chunk so narration starts sooner; longer ones after. */
function splitForNarration(text, firstMax = 150, restMax = 240) {
  const sentences = text.match(/[^.؟!…]+[.؟!…]*\s*/g) || [text];
  const chunks = [];
  let buf = '';
  for (const s of sentences) {
    const max = chunks.length === 0 ? firstMax : restMax;
    if (buf && (buf + s).length > max) { chunks.push(buf.trim()); buf = s; }
    else buf += s;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

/**
 * `scenes` is `[{ text, image }]` from getStory() — one narration chunk per
 * scene, each with its own picture (or `image: null` for an older cached
 * story, or a scene whose picture failed to generate). Each scene's text is
 * synthesised as its own clip, and its picture is shown the moment that clip
 * starts — the slideshow is just "whatever scene is currently playing."
 */
async function speakStory(scenes) {
  const token = beginSpeaking();
  const voiceId = await resolveVoice();
  if (!voiceId) { openSettings(); return 'no-voice'; }

  const LOOKAHEAD = 2;
  const pending = new Array(scenes.length).fill(null);
  const start = i => {
    if (i < scenes.length && !pending[i]) pending[i] = synthesize(scenes[i].text, voiceId);
  };
  for (let i = 0; i <= LOOKAHEAD; i++) start(i);

  try {
    const first = await pending[0];
    if (token !== speakToken) return 'stopped';

    // Let the second chunk get a head start so the first seam doesn't gap.
    if (scenes.length > 1) {
      await Promise.race([pending[1], new Promise(r => setTimeout(r, 2000))]);
      if (token !== speakToken) return 'stopped';
    }

    for (let i = 0; i < scenes.length; i++) {
      const url = i === 0 ? first : await pending[i];
      if (token !== speakToken) return 'stopped';
      start(i + LOOKAHEAD);

      showScene(scenes[i]);
      const outcome = await playClip(url, token);
      if (token !== speakToken) return 'stopped';
      // Previously only 'blocked' was handled here — a stall or a decode
      // error on any other scene fell through silently: no message, and
      // the loop moved on (or, on the last scene, ended looking exactly
      // like a story that had finished normally).
      if (outcome !== 'ended') {
        showError(describePlaybackError(outcome));
        return outcome;
      }
    }
  } catch (e) {
    if (token === speakToken) showError(e.message);
    logEvent('speak-story-error', { message: e.message });
    return 'error';
  }
  return 'finished';
}

// ============================================================
//   WORDS
// ============================================================
const categories = {
  animals: [
    { img: 'pictures/animals/bird.png',    word: 'پرنده' },
    { img: 'pictures/animals/cat.png',     word: 'گربه'  },
    { img: 'pictures/animals/cow.png',     word: 'گاو'   },
    { img: 'pictures/animals/dog.png',     word: 'سگ'    },
    { img: 'pictures/animals/fish.png',    word: 'ماهی'  },
    { img: 'pictures/animals/hourse.webp', word: 'اسب'   },
    { img: 'pictures/animals/mouse.png',   word: 'موش'   },
    { img: 'pictures/animals/pig.png',     word: 'خوک'   },
    { img: 'pictures/animals/rabbit.png',  word: 'خرگوش' },
  ],
  face: [
    { img: 'pictures/face/ear.png',     word: 'گوش'   },
    { img: 'pictures/face/eye.png',     word: 'چشم'   },
    { img: 'pictures/face/eyebrow.jpg', word: 'ابرو'  },
    { img: 'pictures/face/hair.png',    word: 'مو'    },
    { img: 'pictures/face/hand.png',    word: 'دست'   },
    { img: 'pictures/face/leg.jpg',     word: 'پا'    },
    { img: 'pictures/face/lips.png',    word: 'لب'    },
    { img: 'pictures/face/neck.jpg',    word: 'گردن'  },
    { img: 'pictures/face/nose.jpg',    word: 'بینی'  },
    { img: 'pictures/face/tongue.jpg',  word: 'زبان'  },
    { img: 'pictures/face/tooth.png',   word: 'دندان' },
  ],
};

// Collections the parent creates ("Colors", "Family", ...) each get their own
// entry in `categories`, keyed by their IndexedDB key — populated at startup
// and after every create/delete. Animals and Face & body are the only
// categories that ship with words already in them.
const BUILTIN_CATEGORIES = ['animals', 'face'];
const isBuiltinCategory = cat => BUILTIN_CATEGORIES.includes(cat);

let currentCategory = 'animals';
let currentIndex = 0;

const cardEl      = document.getElementById('card');
const cardEmptyEl = document.getElementById('card-empty');
const cardDelBtn  = document.getElementById('card-del');
const cardAddBtn  = document.getElementById('card-add');
const dispImg     = document.getElementById('disp-emoji');
const dispWord    = document.getElementById('disp-word');
const counterEl   = document.getElementById('counter');
const dotsEl      = document.getElementById('dots');

function updateDisplay(animate = true) {
  const items = categories[currentCategory] || [];
  const isCustom = !isBuiltinCategory(currentCategory);

  // A fresh collection starts empty — show an invitation to add the first
  // word instead of indexing into a deck that has nothing in it.
  if (items.length === 0) {
    cardEl.hidden = true;
    cardEmptyEl.hidden = false;
    cardDelBtn.hidden = true;
    cardAddBtn.hidden = true;
    counterEl.textContent = '';
    dotsEl.innerHTML = '';
    return;
  }
  cardEl.hidden = false;
  cardEmptyEl.hidden = true;

  const item = items[currentIndex];
  dispImg.src = item.img;
  dispImg.alt = '';
  dispWord.textContent = item.word;
  counterEl.textContent = `${currentIndex + 1} / ${items.length}`;
  cardDelBtn.hidden = !isCustom;
  cardAddBtn.hidden = !isCustom;

  dotsEl.innerHTML = '';
  items.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'dot' + (i === currentIndex ? ' active' : '');
    dotsEl.appendChild(d);
  });

  if (animate) {
    cardEl.classList.remove('pop');
    void cardEl.offsetWidth;
    cardEl.classList.add('pop');
  }
}

function setCategory(cat, btn) {
  currentCategory = cat;
  currentIndex = 0;
  document.querySelectorAll('.deck-tab').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  updateDisplay();
  sayWord();
}

function navigate(dir) {
  const items = categories[currentCategory];
  if (items.length === 0) return;
  currentIndex = (currentIndex + dir + items.length) % items.length;
  updateDisplay();
  sayWord();
}

function sayWord() {
  const items = categories[currentCategory];
  if (items.length === 0) return;

  const word = items[currentIndex].word;
  speakText(word);

  const voiceId = getVoice();
  if (voiceId && items.length > 1) {
    prefetch(items[(currentIndex + 1) % items.length].word, voiceId);
    prefetch(items[(currentIndex - 1 + items.length) % items.length].word, voiceId);
  }
}

const GREETINGS = ['سلام', 'خوبی؟', 'خداحافظ'];
let greetingIndex = 0;

function tapBluey() {
  if (document.body.dataset.mode === 'play') return;
  const g = GREETINGS[greetingIndex % GREETINGS.length];
  greetingIndex++;
  speakText(g);
}

// ============================================================
//   MODES
// ============================================================
function setMode(mode) {
  document.body.dataset.mode = mode;
  if (mode === 'setup') renderHistory();
  document.getElementById('tab-learn').classList.toggle('is-active', mode === 'learn');
  document.getElementById('tab-story').classList.toggle('is-active', mode !== 'learn');
  document.getElementById('tab-learn').setAttribute('aria-selected', mode === 'learn');
  document.getElementById('tab-story').setAttribute('aria-selected', mode !== 'learn');
}

// ============================================================
//   STORY SETUP
//   Six focuses drawn from things a 3-year-old is actually working on.
// ============================================================
const THEMES = [
  {
    id: 'potty', label: 'Potty time', color: '#5AA9E6',
    focus: 'using the potty on their own, staying dry, and feeling proud about it',
    icon: '<rect x="6.5" y="2.8" width="10.5" height="5.2" rx="1.2"/><path d="M4.2 9.6h15.6v1a6.6 6 0 0 1-6.6 6h-2.4a6.6 6 0 0 1-6.6-6z"/><path d="M10.2 16.8 9.6 21h4.8l-.6-4.2"/>',
  },
  {
    id: 'sleep', label: 'Going to sleep', color: '#7B7FD4',
    focus: 'settling down at bedtime, staying in their own bed, and falling asleep calmly',
    icon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/><path d="M16 4.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
  },
  {
    id: 'teeth', label: 'Brushing teeth', color: '#48B89F',
    focus: 'brushing their teeth morning and night without a fuss',
    icon: '<path d="M5 9c0-2 1.6-3.4 3.5-3.4 1.2 0 2.3.5 3.5.5s2.3-.5 3.5-.5C17.4 5.6 19 7 19 9c0 3-1.2 4-1.7 6.4-.4 1.8-.7 3.6-1.8 3.6-1.3 0-1.2-2.6-2-4.3-.3-.6-.7-1-1.5-1s-1.2.4-1.5 1c-.8 1.7-.7 4.3-2 4.3-1.1 0-1.4-1.8-1.8-3.6C6.2 13 5 12 5 9z"/>',
  },
  {
    id: 'food', label: 'Trying new food', color: '#E8964F',
    focus: 'being brave about tasting a new food at dinner',
    icon: '<path d="M12 8.8c-1-1.2-2.4-1.7-3.7-1.2C6.5 8.3 5.5 10.2 6 12.5c.5 2.5 2.3 5.6 3.9 6.4 1 .5 1.5 0 2.1 0s1.1.5 2.1 0c1.6-.8 3.4-3.9 3.9-6.4.5-2.3-.5-4.2-2.3-4.9-1.3-.5-2.7 0-3.7 1.2z"/><path d="M12 8.8V5.6"/><path d="M12 5.6c1.6 0 2.6-1 2.6-2.6-1.6 0-2.6 1-2.6 2.6z"/>',
  },
  {
    id: 'sharing', label: 'Sharing with friends', color: '#E4779B',
    focus: 'taking turns and sharing toys with a friend, even when it is hard',
    icon: '<path d="M12 20s-6.5-4-6.5-9A3.5 3.5 0 0 1 12 9.4 3.5 3.5 0 0 1 18.5 11c0 5-6.5 9-6.5 9z"/>',
  },
  {
    id: 'feelings', label: 'Big feelings', color: '#C77DD4',
    focus: 'noticing a big feeling like anger or frustration and finding a way to calm down',
    icon: '<circle cx="12" cy="12" r="8.2"/><path d="M9 10.2h.01M15 10.2h.01"/><path d="M8.8 15.2c.9-1 2-1.5 3.2-1.5s2.3.5 3.2 1.5"/>',
  },
];

const LENGTHS = [
  { minutes: 1, label: '1 min' },
  { minutes: 2, label: '2 min' },
  { minutes: 3, label: '3 min' },
];

let selectedTheme = null;
let selectedMinutes = 1;

const themesEl    = document.getElementById('themes');
const lengthsEl   = document.getElementById('lengths');
const promptEl    = document.getElementById('story-prompt');
const startBtn    = document.getElementById('start-btn');
const setupNote   = document.getElementById('setup-note');
const loadingBar  = document.getElementById('loading-bar');
const playThemeEl  = document.getElementById('playing-theme');
const storyTextEl  = document.getElementById('story-text');
const storySceneEl = document.getElementById('story-scene');

function renderThemes() {
  themesEl.innerHTML = '';
  THEMES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'theme';
    b.style.color = t.color;
    b.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
            stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg>
       <span>${t.label}</span>`;
    b.onclick = () => {
      selectedTheme = selectedTheme?.id === t.id ? null : t;
      renderThemes();
    };
    if (selectedTheme?.id === t.id) b.classList.add('is-active');
    themesEl.appendChild(b);
  });
}

function renderLengths() {
  lengthsEl.innerHTML = '';
  LENGTHS.forEach(l => {
    const b = document.createElement('button');
    b.className = 'length' + (l.minutes === selectedMinutes ? ' is-active' : '');
    b.textContent = l.label;
    b.onclick = () => { selectedMinutes = l.minutes; renderLengths(); };
    lengthsEl.appendChild(b);
  });
}

// Set only while a story is actually being generated — startStory() checks
// this first, so the same button that started it cancels it on a second tap.
let storyController = null;

function resetStoryForm() {
  storyController = null;
  setupNote.classList.remove('is-loading');
  loadingBar.hidden = true;
  startBtn.textContent = 'Start the story';
}

async function startStory() {
  // One more direct shot at resuming the AudioContext, tied to this exact
  // click — the most important gesture to get right, since everything the
  // story is about to say depends on it. Cheap insurance on top of the
  // page-wide pointerdown listener; a no-op if already running.
  lipSync.ensureGraph();

  if (storyController) {           // already generating — this tap means cancel
    storyController.abort();
    return;
  }

  const custom = promptEl.value.trim();
  if (!selectedTheme && !custom) {
    setupNote.textContent = 'Pick a focus above, or type what the story should be about.';
    setupNote.classList.add('error');
    return;
  }

  setupNote.classList.remove('error');
  // A fresh story now also draws a picture for each scene, which takes
  // longer than the text alone — say so, and show something visibly moving,
  // so a 20-40s wait reads as working rather than stuck. A replayed (cached)
  // story resolves almost immediately and these just flash past.
  setupNote.textContent = 'Writing the story and drawing the pictures';
  setupNote.classList.add('is-loading');
  loadingBar.hidden = false;
  startBtn.textContent = 'Cancel';
  storyController = new AbortController();

  let scenes, characters;
  try {
    ({ scenes, characters } = await getStory({
      prompt:  custom,
      focus:   selectedTheme?.focus || '',
      minutes: selectedMinutes,
      label:   custom || selectedTheme?.label || 'A story',
      signal:  storyController.signal,
    }));
  } catch (e) {
    const cancelled = e.name === 'AbortError';
    resetStoryForm();
    setupNote.textContent = cancelled ? '' : e.message;
    setupNote.classList.toggle('error', !cancelled);
    return;
  }

  // What OpenAI actually produced, for inspecting in devtools — the
  // character sheet every scene's picture is built from, and each scene's
  // narration text alongside its own picture prompt.
  console.log('[OpenAI] story characters:', characters);
  scenes.forEach((s, i) => console.log(`[OpenAI] scene ${i}:`, { text: s.text, image: s.image }));

  resetStoryForm();
  setupNote.textContent = '';
  promptEl.value = '';   // otherwise the next visit to setup still shows this request
  renderHistory();
  await playStory(scenes, selectedTheme?.label || custom || 'A story for you');
}

/** Delivery tags like [giggles] are for the voice, not the reader — the
 *  parent following along on screen shouldn't see stage directions. */
function stripDeliveryTags(text) {
  return text.replace(/\[[^\]]*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Stories from before scenes/pictures existed come back from getStory() as
 *  one giant scene with no image. Left whole, that would be one very long
 *  single TTS clip with a long wait and no pacing — so anything oversized
 *  still gets split for narration, it just won't have pictures to show.
 *
 *  Only scenes with no picture need this: a real scene already has one, and
 *  is already paced by the story generator itself (3-6 scenes, roughly
 *  equal length) — splitting it further here would just orphan its picture
 *  on the first half and leave the rest with nothing, for no reason. */
function expandLongScenes(scenes) {
  const MAX = 260;
  const out = [];
  for (const scene of scenes) {
    if (scene.image || scene.text.length <= MAX) { out.push(scene); continue; }
    splitForNarration(scene.text, MAX, MAX).forEach(text => out.push({ text, image: null }));
  }
  return out;
}

/** Shows the scene currently narrating: its picture, if it has one, and its
 *  text (stage-direction tags stripped, same as before). This *is* the
 *  slideshow — there's no separate timer, it just tracks playback. */
function showScene(scene) {
  storyTextEl.textContent = stripDeliveryTags(scene.text);
  if (!scene.image) { storySceneEl.hidden = true; return; }

  storySceneEl.classList.add('is-changing');
  // Swap the src while faded out so the crossfade covers the change itself,
  // not just the fade — a plain src swap has no transition of its own.
  setTimeout(() => {
    storySceneEl.src = scene.image;
    storySceneEl.hidden = false;
    requestAnimationFrame(() => storySceneEl.classList.remove('is-changing'));
  }, 200);
}

/** Shared by a fresh story and by replaying one from the history. */
async function playStory(rawScenes, label) {
  const scenes = expandLongScenes(rawScenes);
  playThemeEl.textContent = label;
  storyTextEl.textContent = '';
  storySceneEl.hidden = true;
  isPaused = false;
  repeatAction = null;
  renderPauseButton();
  setMode('play');
  // The first chunk takes a few seconds to synthesise. Say so, otherwise a
  // motionless Bluey reads as broken rather than as getting ready.
  document.body.classList.add('preparing');
  const outcome = await speakStory(scenes);
  document.body.classList.remove('preparing');
  if (outcome === 'finished') {
    // Stay right here instead of bouncing back to setup — a kid watching
    // the picture and text doesn't want the screen to change out from under
    // them the moment it ends. Repeating replays the scenes already in
    // hand, so it's instant, no regenerating anything.
    showRepeatButton(() => playStory(rawScenes, label));
  } else if (outcome !== 'stopped') {
    setMode('setup');
  }
}

// ── History ──────────────────────────────────────────────────
const historyEl     = document.getElementById('history');
const historyListEl = document.getElementById('history-list');

async function renderHistory() {
  const stories = await listStories();
  historyEl.hidden = stories.length === 0;
  historyListEl.innerHTML = '';

  stories.forEach(rec => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const play = document.createElement('button');
    play.className = 'history-play';
    // dir="auto" so a Persian label renders right-to-left and an English one doesn't.
    play.innerHTML =
      `<span class="history-label" dir="auto">${escapeHtml(rec.label)}</span>
       <span class="history-meta">${rec.minutes} min${rec.minutes > 1 ? 's' : ''}</span>`;
    play.onclick = () => playStory(normalizeScenes(rec), rec.label);

    const del = document.createElement('button');
    del.className = 'history-del';
    del.setAttribute('aria-label', `Remove ${rec.label}`);
    del.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
            stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
    del.onclick = async () => { await deleteStory(rec._key); renderHistory(); };

    li.append(play, del);
    historyListEl.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Set only while a finished story is sitting on screen waiting for a tap —
 *  the same button that paused mid-story now repeats it from the start. */
let repeatAction = null;

/** Pause and resume the narration in place; the story keeps its position.
 *  Once the story has actually finished, this same button repeats it instead. */
function togglePause() {
  if (repeatAction) { const again = repeatAction; repeatAction = null; again(); return; }
  if (!currentAudio) return;
  isPaused = !isPaused;

  if (isPaused) {
    currentAudio.pause();
    clipWatchdog?.disarm();
  } else {
    clipWatchdog?.arm();
    currentAudio.play().catch(() => {});
  }
  renderPauseButton();
}

function renderPauseButton() {
  const icon  = document.getElementById('pause-icon');
  const label = document.getElementById('pause-label');
  if (!icon || !label) return;

  icon.innerHTML = isPaused
    ? '<path d="M8 5.4v13.2a.6.6 0 0 0 .93.5l10-6.6a.6.6 0 0 0 0-1l-10-6.6a.6.6 0 0 0-.93.5z"/>'
    : '<rect x="7.5" y="6" width="3.4" height="12" rx="1.4"/>' +
      '<rect x="13.1" y="6" width="3.4" height="12" rx="1.4"/>';
  label.textContent = isPaused ? 'Play' : 'Pause';
}

/** The story just finished on its own (not paused, not left) — offer to
 *  hear it again right where it is, instead of jumping back to setup. */
function showRepeatButton(action) {
  repeatAction = action;
  const icon  = document.getElementById('pause-icon');
  const label = document.getElementById('pause-label');
  if (!icon || !label) return;
  icon.innerHTML =
    '<path d="M12,5V1L7,6l5,5V7c3.31,0,6,2.69,6,6s-2.69,6-6,6s-6-2.69-6-6H4c0,4.42,3.58,8,8,8' +
    's8-3.58,8-8S16.42,5,12,5z"/>';
  label.textContent = 'Play again';
}

/** Leave story playback entirely and return to the setup screen. */
function leaveStory() {
  beginSpeaking();          // bumps the token, so narration unwinds
  isPaused = false;
  renderPauseButton();
  setMode('setup');
}

// ============================================================
//   CONFIRM DIALOG  — shared by collection and card deletion
// ============================================================
const confirmDialogEl = document.getElementById('confirm-dialog');
const confirmTitleEl  = document.getElementById('confirm-title');
const confirmMsgEl    = document.getElementById('confirm-message');
const confirmDangerBtn = document.getElementById('confirm-danger-btn');

function openConfirmDialog(title, message, onConfirm) {
  confirmTitleEl.textContent = title;
  confirmMsgEl.textContent = message;
  confirmDangerBtn.onclick = () => { closeConfirmDialog(); onConfirm(); };
  confirmDialogEl.classList.add('open');
}

function closeConfirmDialog() {
  confirmDialogEl.classList.remove('open');
}

// ============================================================
//   SETTINGS
// ============================================================
const settingsEl  = document.getElementById('settings');
const voiceSelect = document.getElementById('voice-bluey');
const statusEl    = document.getElementById('settings-status');
const diagnosticsOutput = document.getElementById('diagnostics-output');

function openSettings()  { settingsEl.classList.add('open'); refreshVoices(); }
function closeSettings() { settingsEl.classList.remove('open'); }

async function refreshVoices() {
  statusEl.textContent = 'Loading voices…';
  statusEl.classList.remove('error');
  try {
    const voices = await listVoices();
    const saved = getVoice();
    voiceSelect.innerHTML = '';
    voices.forEach(v => {
      const o = document.createElement('option');
      o.value = v.voice_id;
      const traits = [v.labels.age, v.labels.gender, v.labels.accent].filter(Boolean).join(', ');
      o.textContent = traits ? `${v.name} — ${traits}` : v.name;
      if (saved === v.voice_id) o.selected = true;
      voiceSelect.appendChild(o);
    });
    if (!saved && voices.length) {
      // Jessica is the default. Only applies when nothing has been picked
      // yet (saved is empty) — once a voice is chosen, setVoice() persists
      // it in localStorage and this branch never runs again on that device.
      // ElevenLabs' premade voices carry their tagline in the name field
      // itself ("Jessica - Playful, Bright, Warm"), so this has to match
      // the start of it rather than the bare name. Falls back to the first
      // voice in the account if Jessica isn't in it.
      const preferred = voices.find(v => v.name.split(' - ')[0].trim() === 'Jessica') || voices[0];
      setVoice(preferred.voice_id);
      voiceSelect.value = preferred.voice_id;
    }
    statusEl.textContent = `${voices.length} voices available.`;
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.classList.add('error');
  }
}

voiceSelect.addEventListener('change', () => setVoice(voiceSelect.value));

async function clearAudioCache() {
  await clearCache();
  statusEl.textContent = 'Saved audio cleared.';
  statusEl.classList.remove('error');
}

let toastTimer = null;
function showError(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200);
}

// ============================================================
//   INPUT
// ============================================================
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
  if (document.body.dataset.mode !== 'learn') {
    if (e.key === 'Escape' && document.body.dataset.mode === 'play') leaveStory();
    return;
  }
  if (e.key === 'ArrowLeft')  navigate(-1);
  if (e.key === 'ArrowRight') navigate(1);
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); sayWord(); }
});

promptEl.addEventListener('keydown', e => { if (e.key === 'Enter') startStory(); });

let touchX = 0, touchY = 0;
cardEl.addEventListener('touchstart', e => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}, { passive: true });
cardEl.addEventListener('touchend', e => {
  const dx = touchX - e.changedTouches[0].clientX;
  const dy = touchY - e.changedTouches[0].clientY;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) navigate(dx > 0 ? 1 : -1);
});

// ============================================================
//   COLLECTIONS  (parent-created decks, e.g. "Colors", "Family")
// ============================================================
let customCollections = [];   // [{ _key, name }], creation order

async function loadCollections() {
  const { collections, cards } = await getVocabulary();
  customCollections = collections;
  for (const coll of customCollections) {
    categories[coll._key] = cards
      .filter(c => c.collectionId === coll._key)
      .map(c => ({ img: c.imageUrl, word: c.word_fa, _key: c._key }));
  }
  renderDeckTabs();
  if (currentCategory !== 'animals' && currentCategory !== 'face' && categories[currentCategory]) {
    currentIndex = Math.min(currentIndex, Math.max(0, categories[currentCategory].length - 1));
    updateDisplay(false);
  }
}

function renderDeckTabs() {
  const tabsEl = document.getElementById('deck-tabs');
  tabsEl.querySelectorAll('.deck-tab-custom').forEach(el => el.remove());

  customCollections.forEach(coll => {
    const btn = document.createElement('button');
    btn.className = 'deck-tab deck-tab-custom';
    btn.dataset.cat = coll._key;
    btn.type = 'button';
    if (coll._key === currentCategory) btn.classList.add('is-active');

    const label = document.createElement('span');
    label.textContent = coll.name;
    label.className = 'deck-tab-label';
    label.onclick = () => setCategory(coll._key, btn);

    const del = document.createElement('span');
    del.className = 'deck-tab-del';
    del.textContent = '×';
    del.title = `Remove "${coll.name}"`;
    del.onclick = e => {
      e.stopPropagation();
      openConfirmDialog(
        'Delete this collection?',
        `"${coll.name}" and every word in it will be gone for good.`,
        () => removeCollection(coll._key)
      );
    };

    btn.append(label, del);
    tabsEl.appendChild(btn);
  });
}

async function removeCollection(key) {
  await deleteCollection(key);
  delete categories[key];
  await loadCollections();

  if (currentCategory === key) {
    currentCategory = 'animals';
    currentIndex = 0;
    document.querySelectorAll('.deck-tab').forEach(b => b.classList.remove('is-active'));
    document.querySelector('.deck-tab[data-cat="animals"]')?.classList.add('is-active');
    updateDisplay(false);
  }
}

function openNewCollection() {
  const input  = document.getElementById('new-collection-name');
  const status = document.getElementById('new-collection-status');
  input.value = '';
  status.textContent = '';
  status.classList.remove('error');
  document.getElementById('new-collection').classList.add('open');
  input.focus();
}

function closeNewCollection() {
  document.getElementById('new-collection').classList.remove('open');
}

async function submitNewCollection() {
  const input  = document.getElementById('new-collection-name');
  const status = document.getElementById('new-collection-status');
  const name = input.value.trim();
  if (!name) {
    status.textContent = 'Give the collection a name.';
    status.classList.add('error');
    return;
  }

  const coll = await createCollection(name);
  categories[coll._key] = [];
  closeNewCollection();
  await loadCollections();

  // Land on the new, empty collection, ready for its first word.
  currentCategory = coll._key;
  currentIndex = 0;
  document.querySelectorAll('.deck-tab').forEach(b => b.classList.remove('is-active'));
  document.querySelector(`.deck-tab[data-cat="${coll._key}"]`)?.classList.add('is-active');
  updateDisplay(false);
}

document.getElementById('new-collection-name')
  .addEventListener('keydown', e => { if (e.key === 'Enter') submitNewCollection(); });

// ============================================================
//   CUSTOM CARDS  (words inside a collection)
// ============================================================
const addWordEl     = document.getElementById('add-word');
const addWordTarget = document.getElementById('add-word-target');
const newWordField  = document.getElementById('new-word-field');
const newWordInput  = document.getElementById('new-word');
const addWordStatus = document.getElementById('add-word-status');
const generateActionsEl = document.getElementById('add-word-generate-actions');
const confirmActionsEl  = document.getElementById('add-word-confirm-actions');
const addWordBtn    = document.getElementById('add-word-btn');
const confirmBtn    = document.getElementById('add-word-confirm-btn');
const cardPreviewEl = document.getElementById('card-preview');
const cardPreviewImg  = document.getElementById('card-preview-img');
const cardPreviewWord = document.getElementById('card-preview-word');

let addWordTargetKey = null;   // which collection the sheet is adding to
let pendingCard = null;        // generated but not yet saved

async function loadCardsFor(collectionId) {
  const cards = await listCards(collectionId);
  categories[collectionId] = cards.map(c => ({
    img: c.imageUrl, word: c.word_fa, _key: c._key,
  }));
  if (currentCategory === collectionId) {
    currentIndex = Math.min(currentIndex, Math.max(0, categories[collectionId].length - 1));
    updateDisplay(false);
  }
}

/** Opens the sheet targeting whichever collection is currently on screen. */
function openAddWordForCurrent(event) {
  event?.stopPropagation();
  if (isBuiltinCategory(currentCategory)) return;
  openAddWord(currentCategory);
}

function openAddWord(collectionId) {
  addWordTargetKey = collectionId;
  const coll = customCollections.find(c => c._key === collectionId);
  addWordTarget.textContent = coll?.name || 'this collection';

  newWordInput.value = '';
  newWordField.hidden = false;
  addWordStatus.textContent = '';
  addWordStatus.classList.remove('error');
  cardPreviewEl.hidden = true;
  pendingCard = null;

  generateActionsEl.hidden = false;
  confirmActionsEl.hidden = true;
  addWordBtn.disabled = false;

  addWordEl.classList.add('open');
  newWordInput.focus();
}

function closeAddWord() {
  addWordEl.classList.remove('open');
  pendingCard = null;   // an un-confirmed generated card is simply discarded
}

/** Step 1: generate a translation + picture, but save nothing yet. */
async function generateNewWord() {
  const word = newWordInput.value.trim();
  if (!word) {
    addWordStatus.textContent = 'Type a word first.';
    addWordStatus.classList.add('error');
    return;
  }

  addWordBtn.disabled = true;
  addWordStatus.classList.remove('error');
  addWordStatus.textContent = 'Translating and drawing a picture…';
  cardPreviewEl.hidden = true;

  try {
    pendingCard = await generateCard(word);
  } catch (e) {
    addWordStatus.textContent = e.message;
    addWordStatus.classList.add('error');
    addWordBtn.disabled = false;
    return;
  }

  cardPreviewImg.src = pendingCard.imageUrl;
  cardPreviewWord.textContent = pendingCard.word_fa;
  cardPreviewEl.hidden = false;
  addWordStatus.textContent = 'Good to add?';
  newWordField.hidden = true;

  generateActionsEl.hidden = true;
  confirmActionsEl.hidden = false;
}

/** Back to the input, discarding whatever was just generated. */
function retryNewWord() {
  pendingCard = null;
  newWordField.hidden = false;
  cardPreviewEl.hidden = true;
  addWordStatus.textContent = '';
  generateActionsEl.hidden = false;
  confirmActionsEl.hidden = true;
  newWordInput.focus();
}

/** Step 2: the parent has seen the picture and word — now actually save it. */
async function confirmNewWord() {
  if (!pendingCard || !addWordTargetKey) return;

  confirmBtn.disabled = true;
  const saved = await saveCard({ ...pendingCard, collectionId: addWordTargetKey });
  pendingCard = null;

  const targetKey = addWordTargetKey;
  await loadCardsFor(targetKey);

  // Switch to that collection and land on the card just added.
  currentCategory = targetKey;
  currentIndex = categories[targetKey].length - 1;
  document.querySelectorAll('.deck-tab').forEach(b => b.classList.remove('is-active'));
  document.querySelector(`.deck-tab[data-cat="${targetKey}"]`)?.classList.add('is-active');
  updateDisplay(true);

  confirmBtn.disabled = false;
  closeAddWord();
  sayWord();
}

function deleteCurrentCard(event) {
  event.stopPropagation();   // the card itself also opens sayWord() on click
  if (isBuiltinCategory(currentCategory)) return;
  const item = categories[currentCategory]?.[currentIndex];
  if (!item) return;

  openConfirmDialog(
    'Delete this word?',
    `"${item.word}" will be gone for good.`,
    () => reallyDeleteCard(item)
  );
}

async function reallyDeleteCard(item) {
  await deleteCard(item._key);
  await loadCardsFor(currentCategory);
  currentIndex = Math.min(currentIndex, Math.max(0, categories[currentCategory].length - 1));
  updateDisplay(true);
}

newWordInput.addEventListener('keydown', e => { if (e.key === 'Enter') generateNewWord(); });

// ============================================================
//   EXPOSE + INIT
// ============================================================
Object.assign(window, {
  setMode, setCategory, navigate, sayWord, tapBluey,
  startStory, togglePause, leaveStory,
  openSettings, closeSettings, clearAudioCache, copyDiagnostics,
  openNewCollection, closeNewCollection, submitNewCollection,
  openAddWordForCurrent, closeAddWord, generateNewWord, retryNewWord, confirmNewWord,
  deleteCurrentCard, closeConfirmDialog,
  __lipSync: lipSync,
});

// Tapping the dimmed backdrop closes whichever sheet is open — but not a tap
// that started inside the sheet and merely ended over the backdrop (e.g.
// selecting text). Each sheet's own close function runs, not a blind class
// toggle, so state that needs resetting (a pending generated card, etc.)
// still gets reset correctly.
const SHEET_CLOSERS = {
  'settings':       closeSettings,
  'add-word':       closeAddWord,
  'new-collection': closeNewCollection,
  'confirm-dialog': closeConfirmDialog,
};
document.querySelectorAll('.sheet-overlay').forEach(overlay => {
  let downOnBackdrop = false;
  overlay.addEventListener('pointerdown', e => { downOnBackdrop = (e.target === overlay); });
  overlay.addEventListener('click', e => {
    if (downOnBackdrop && e.target === overlay) (SHEET_CLOSERS[overlay.id] || (() => {}))();
  });
});

renderThemes();
renderLengths();
renderHistory();
updateDisplay(false);
voicesReady = refreshVoices();

// Load every collection and card — one request — before the deck tabs are usable.
loadCollections();
