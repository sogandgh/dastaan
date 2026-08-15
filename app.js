import {
  synthesize, prefetch, listVoices, clearCache, getVoice, setVoice,
  getStory, listStories, deleteStory,
} from './tts.js';

const blueyEl   = document.getElementById('bluey');
const stageEl   = document.querySelector('.bluey-stage');
const captionEl = document.getElementById('bluey-caption');
const levelsEl  = document.getElementById('levels');
const toastEl   = document.getElementById('toast');

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
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      this.buffer = new Uint8Array(this.analyser.fftSize);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
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
//   SPEECH
// ============================================================
let currentAudio = null;
let speakToken   = 0;
let voicesReady  = null;

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
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    currentAudio = audio;

    let settled = false;
    let watchdog = null;
    const done = outcome => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      lipSync.stop();
      resolve(outcome);
    };

    const analysed = lipSync.attach(audio);

    audio.onloadedmetadata = () => {
      if (analysed) lipSync.start();
      else lipSync.fallback(audio.duration || 2);
      clearTimeout(watchdog);
      watchdog = setTimeout(() => done('stalled'), (audio.duration || 10) * 1000 + 8000);
    };
    audio.onended = () => done('ended');
    audio.onerror = () => done('error');

    audio.play().catch(e =>
      done(e.name === 'NotAllowedError' ? 'blocked' : 'error')
    );

    watchdog = setTimeout(() => done('stalled'), 30000);
    if (token !== speakToken) { audio.pause(); done('ended'); }
  });
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
    return;
  }
  if (token !== speakToken) return;
  playClip(url, token);
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

async function speakStory(text) {
  const token = beginSpeaking();
  const voiceId = await resolveVoice();
  if (!voiceId) { openSettings(); return 'no-voice'; }

  const chunks = splitForNarration(text);
  const LOOKAHEAD = 2;
  const pending = new Array(chunks.length).fill(null);
  const start = i => {
    if (i < chunks.length && !pending[i]) pending[i] = synthesize(chunks[i], voiceId);
  };
  for (let i = 0; i <= LOOKAHEAD; i++) start(i);

  try {
    const first = await pending[0];
    if (token !== speakToken) return 'stopped';

    // Let the second chunk get a head start so the first seam doesn't gap.
    if (chunks.length > 1) {
      await Promise.race([pending[1], new Promise(r => setTimeout(r, 2000))]);
      if (token !== speakToken) return 'stopped';
    }

    for (let i = 0; i < chunks.length; i++) {
      const url = i === 0 ? first : await pending[i];
      if (token !== speakToken) return 'stopped';
      start(i + LOOKAHEAD);

      const outcome = await playClip(url, token);
      if (token !== speakToken) return 'stopped';
      if (outcome === 'blocked') {
        showError('Tap Bluey once to let him talk, then start again.');
        return 'blocked';
      }
    }
  } catch (e) {
    if (token === speakToken) showError(e.message);
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

let currentCategory = 'animals';
let currentIndex = 0;

const cardEl    = document.getElementById('card');
const dispImg   = document.getElementById('disp-emoji');
const dispWord  = document.getElementById('disp-word');
const counterEl = document.getElementById('counter');
const dotsEl    = document.getElementById('dots');

function updateDisplay(animate = true) {
  const items = categories[currentCategory];
  const item = items[currentIndex];

  dispImg.src = item.img;
  dispImg.alt = '';
  dispWord.textContent = item.word;
  counterEl.textContent = `${currentIndex + 1} / ${items.length}`;

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
  currentIndex = (currentIndex + dir + items.length) % items.length;
  updateDisplay();
  sayWord();
}

function sayWord() {
  const items = categories[currentCategory];
  const word = items[currentIndex].word;
  showCaption(word);
  speakText(word);

  const voiceId = getVoice();
  if (voiceId) {
    prefetch(items[(currentIndex + 1) % items.length].word, voiceId);
    prefetch(items[(currentIndex - 1 + items.length) % items.length].word, voiceId);
  }
}

let captionTimer = null;
function showCaption(text) {
  captionEl.textContent = text;
  captionEl.classList.add('show');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => captionEl.classList.remove('show'), 3200);
}

const GREETINGS = ['سلام لی‌لی', 'خوبی لی‌لی؟', 'خداحافظ لی‌لی'];
let greetingIndex = 0;

function tapBluey() {
  if (document.body.dataset.mode === 'play') return;
  const g = GREETINGS[greetingIndex % GREETINGS.length];
  greetingIndex++;
  showCaption(g);
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
const storyTextEl = document.getElementById('story-text');
const playThemeEl = document.getElementById('playing-theme');

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

async function startStory() {
  const custom = promptEl.value.trim();
  if (!selectedTheme && !custom) {
    setupNote.textContent = 'Pick a focus above, or type what the story should be about.';
    setupNote.classList.add('error');
    return;
  }

  setupNote.classList.remove('error');
  setupNote.textContent = 'Writing the story…';
  startBtn.disabled = true;

  let story;
  try {
    ({ story } = await getStory({
      prompt:  custom,
      focus:   selectedTheme?.focus || '',
      minutes: selectedMinutes,
      label:   custom || selectedTheme?.label || 'A story',
    }));
  } catch (e) {
    setupNote.textContent = e.message;
    setupNote.classList.add('error');
    startBtn.disabled = false;
    return;
  }

  setupNote.textContent = '';
  startBtn.disabled = false;
  renderHistory();
  await playStory(story, selectedTheme?.label || custom || 'A story for you');
}

/** Shared by a fresh story and by replaying one from the history. */
async function playStory(story, label) {
  storyTextEl.textContent = story;
  playThemeEl.textContent = label;
  setMode('play');
  const outcome = await speakStory(story);
  if (outcome !== 'stopped') setMode('setup');
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
    play.onclick = () => playStory(rec.story, rec.label);

    const del = document.createElement('button');
    del.className = 'history-del';
    del.setAttribute('aria-label', `Remove ${rec.label}`);
    del.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
            stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
    del.onclick = async () => { await deleteStory(rec.savedAt); renderHistory(); };

    li.append(play, del);
    historyListEl.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stopStory() {
  beginSpeaking();          // bumps the token, so narration unwinds
  setMode('setup');
}

// ============================================================
//   SETTINGS
// ============================================================
const settingsEl  = document.getElementById('settings');
const voiceSelect = document.getElementById('voice-bluey');
const statusEl    = document.getElementById('settings-status');

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
    if (!saved && voices[0]) {
      setVoice(voices[0].voice_id);
      voiceSelect.value = voices[0].voice_id;
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
    if (e.key === 'Escape' && document.body.dataset.mode === 'play') stopStory();
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
//   EXPOSE + INIT
// ============================================================
Object.assign(window, {
  setMode, setCategory, navigate, sayWord, tapBluey,
  startStory, stopStory,
  openSettings, closeSettings, clearAudioCache,
});

renderThemes();
renderLengths();
renderHistory();
updateDisplay(false);
voicesReady = refreshVoices();
