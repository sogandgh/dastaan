// ============================================================
//   SPEECH ENGINE
// ============================================================

import {
  synthesize, prefetch, listVoices, clearCache, getVoices, setVoice,
  getStory, listStories,
} from './tts.js';

const blueyEl = document.getElementById('bluey');
const stageEl = document.querySelector('.bluey-stage');

const VISEME_LOOP = ['open', 'wide', 'mid', 'open', 'closed', 'mid', 'wide', 'open'];

const lipSync = {
  _raf: null,
  _frames: [],
  _frameIndex: 0,
  _frameEnd: 0,

  start(durationSecs) {
    this.stop();
    const frameDur = 110;
    const count = Math.max(4, Math.ceil((durationSecs * 1000) / frameDur));
    this._frames = [];
    for (let i = 0; i < count; i++) {
      this._frames.push({ viseme: VISEME_LOOP[i % VISEME_LOOP.length], durationMs: frameDur });
    }
    this._frames.push({ viseme: 'rest', durationMs: 80 });
    this._frameIndex = 0;
    blueyEl.dataset.mouth = this._frames[0].viseme;
    this._frameEnd = performance.now() + this._frames[0].durationMs;
    stageEl.classList.add('talking');
    this._tick();
  },

  _tick() {
    const now = performance.now();
    if (now >= this._frameEnd) {
      this._frameIndex++;
      if (this._frameIndex >= this._frames.length) {
        this.stop();
        return;
      }
      const frame = this._frames[this._frameIndex];
      blueyEl.dataset.mouth = frame.viseme;
      this._frameEnd = now + frame.durationMs;
    }
    this._raf = requestAnimationFrame(() => lipSync._tick());
  },

  stop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    stageEl.classList.remove('talking');
    blueyEl.dataset.mouth = 'rest';
  }
};

let currentAudio = null;
let speakToken   = 0;   // guards against a slow request landing after a newer tap
let voicesReady  = null; // resolves once the voice list has been fetched

/** Stop whatever is playing and claim the right to speak next. */
function beginSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  lipSync.stop();
  return ++speakToken;
}

/** The current character's voice, waiting for the voice list on a cold start. */
async function resolveVoice() {
  let voiceId = getVoices()[currentChar];
  if (!voiceId) {
    await voicesReady;
    voiceId = getVoices()[currentChar];
  }
  return voiceId;
}

/**
 * Play a clip, resolving when it finishes so callers can queue the next one.
 * Resolves 'ended', or 'blocked' when the browser refuses to autoplay — the
 * caller must stop rather than race silently through the rest of a story.
 */
function playClip(url, token) {
  return new Promise(resolve => {
    const audio = new Audio(url);
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

    audio.onloadedmetadata = () => {
      lipSync.start(audio.duration || 1.0);
      // A background tab can suspend playback so 'ended' never fires. Without
      // this the whole story would hang on one chunk, with no way to recover.
      clearTimeout(watchdog);
      watchdog = setTimeout(() => done('stalled'), (audio.duration || 10) * 1000 + 8000);
    };
    audio.onended = () => done('ended');
    audio.onerror  = () => done('error');

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

  setLoading(true);
  let url;
  try {
    url = await synthesize(text, voiceId);
  } catch (e) {
    if (token === speakToken) {
      setLoading(false);
      showError(e.message);
    }
    return;
  }
  if (token !== speakToken) return;   // a newer word was requested meanwhile
  setLoading(false);

  playClip(url, token);
}

/**
 * Split a story so Bluey can start talking before the whole thing is
 * synthesised. The first chunk is deliberately short — it is the only part the
 * child waits for. Later chunks are longer, which reads more naturally and
 * costs fewer requests.
 */
function splitForNarration(text, firstMax = 150, restMax = 240) {
  const sentences = text.match(/[^.؟!…]+[.؟!…]*\s*/g) || [text];
  const chunks = [];
  let buf = '';

  for (const s of sentences) {
    const max = chunks.length === 0 ? firstMax : restMax;
    if (buf && (buf + s).length > max) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

/**
 * Narrate a long text. Each chunk is synthesised while the previous one plays,
 * so the wait is only ever as long as the first sentence takes.
 * Returns once narration finishes (or is interrupted).
 */
async function speakStory(text, onProgress) {
  const token = beginSpeaking();

  const voiceId = await resolveVoice();
  if (!voiceId) { openSettings(); return; }

  const chunks = splitForNarration(text);
  setLoading(true);

  // Synthesise several chunks at once rather than one-at-a-time: a chunk needs
  // to be ready before the previous one stops playing, and one chunk of lead
  // time is not enough to cover a longer chunk's synthesis.
  const LOOKAHEAD = 2;
  const pending = new Array(chunks.length).fill(null);
  const start = i => {
    if (i < chunks.length && !pending[i]) pending[i] = synthesize(chunks[i], voiceId);
  };
  for (let i = 0; i <= LOOKAHEAD; i++) start(i);

  try {
    const first = await pending[0];
    if (token !== speakToken) return;

    // Give the second chunk a moment to land before starting, so the seam after
    // the short opening chunk doesn't gap. Bounded, so a slow request can't
    // hold up the whole story.
    if (chunks.length > 1) {
      await Promise.race([
        pending[1],
        new Promise(r => setTimeout(r, 2000)),
      ]);
      if (token !== speakToken) return;
    }
    setLoading(false);

    for (let i = 0; i < chunks.length; i++) {
      const thisUrl = i === 0 ? first : await pending[i];
      if (token !== speakToken) return;

      start(i + LOOKAHEAD);   // keep the buffer topped up

      onProgress?.(i + 1, chunks.length);
      const outcome = await playClip(thisUrl, token);
      if (token !== speakToken) return;

      // Racing through the remaining chunks in silence would look like the
      // story simply vanished, so stop and say what happened.
      if (outcome === 'blocked') {
        showError('Tap Bluey once to let him talk, then try again.');
        return;
      }
    }
  } catch (e) {
    if (token === speakToken) {
      setLoading(false);
      showError(e.message);
    }
  }
}

// ============================================================
//   DATA
// ============================================================
const charCategory = { bluey: 'animals', bingo: 'face' };

const categories = {
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
};

// ============================================================
//   GREETINGS
// ============================================================
let greetings = { bluey: [], bingo: [] };
let greetingIndex = 0;
let currentChar = 'bluey';

fetch('greetings.json')
  .then(r => r.json())
  .then(data => {
    greetings = data;
    setTimeout(() => {
      spawnSparkles();
      playHi();
    }, 800);
  });

// ============================================================
//   STATE & DOM
// ============================================================
let currentCategory = 'animals';
let currentIndex    = 0;

const bubbleText = document.getElementById('bubble-text');
const bubble     = document.querySelector('.speech-bubble');
const dispEmoji  = document.getElementById('disp-emoji');
const dispWord   = document.getElementById('disp-word');
const counterEl  = document.getElementById('counter');
const dotsEl     = document.getElementById('dots');
const cardEl     = document.getElementById('card');

// ============================================================
//   UI HELPERS
// ============================================================
function updateDisplay(animate) {
  const items = categories[currentCategory];
  const item  = items[currentIndex];

  dispEmoji.src = item.img || '';
  dispEmoji.style.display = item.img ? '' : 'none';
  dispWord.textContent  = item.word;
  counterEl.textContent = `${currentIndex + 1} / ${items.length}`;
  if (animate) setBubble(item.word);

  dotsEl.innerHTML = '';
  items.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'dot' + (i === currentIndex ? ' active' : '');
    dotsEl.appendChild(d);
  });

  if (animate) {
    cardEl.classList.remove('bounce');
    void cardEl.offsetWidth;
    cardEl.classList.add('bounce');
  }
}

function setBubble(text) {
  bubbleText.textContent = text + ' 🐾';
  bubble.classList.remove('pop');
  void bubble.offsetWidth;
  bubble.classList.add('pop');
}

// ============================================================
//   NAVIGATION & SPEECH
// ============================================================
function setCategory(cat, btn) {
  currentCategory = cat;
  currentIndex    = 0;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateDisplay(true);
  setTimeout(sayWord, 300);
}

function navigate(dir) {
  const items = categories[currentCategory];
  currentIndex = (currentIndex + dir + items.length) % items.length;
  updateDisplay(true);
  spawnSparkles();
  stageEl.classList.remove('jumping');
  void stageEl.offsetWidth;
  stageEl.classList.add('jumping');
  stageEl.addEventListener('animationend', function onJumpEnd(e) {
    if (e.animationName === 'blueyJump' || e.animationName === 'blueyJumpMobile' || e.animationName === 'bingoJump' || e.animationName === 'bingoJumpMobile') {
      stageEl.classList.remove('jumping');
      stageEl.removeEventListener('animationend', onJumpEnd);
    }
  });
  setTimeout(sayWord, 280);
}

function sayWord() {
  const items = categories[currentCategory];
  speakText(items[currentIndex].word);

  // Warm the neighbours so arrowing through the deck feels instant.
  const voiceId = getVoices()[currentChar];
  if (voiceId) {
    const next = (currentIndex + 1) % items.length;
    const prev = (currentIndex - 1 + items.length) % items.length;
    prefetch(items[next].word, voiceId);
    prefetch(items[prev].word, voiceId);
  }
}

function changeGreeting(dir) {
  const list = greetings[currentChar] || [];
  if (list.length === 0) return;
  greetingIndex = (greetingIndex + dir + list.length) % list.length;
  playHi();
}

function playHi() {
  const list = greetings[currentChar] || [];
  if (list.length > 0) {
    const g = list[greetingIndex % list.length];
    if (g.text) {
      setBubble(g.text);
      speakText(g.text);
    }
  }
  stageEl.classList.remove('waving');
  void stageEl.offsetWidth;
  stageEl.classList.add('waving');
  stageEl.addEventListener('animationend', function onWaveEnd(e) {
    if (e.animationName === 'blueyWave') {
      stageEl.classList.remove('waving');
      stageEl.removeEventListener('animationend', onWaveEnd);
    }
  });
}

// ============================================================
//   CHARACTER SWITCH
// ============================================================
function switchChar(name) {
  currentChar = name;
  const isBingo = name === 'bingo';
  stageEl.classList.toggle('bingo-mode', isBingo);
  document.getElementById('btn-bluey').classList.toggle('active', !isBingo);
  document.getElementById('btn-bingo').classList.toggle('active', isBingo);
  currentCategory = charCategory[name];
  currentIndex = 0;
  greetingIndex = 0;
  updateDisplay(false);
  playHi();
}
window.switchChar = switchChar;

// Expose to HTML onclick handlers
window.setCategory     = setCategory;
window.navigate        = navigate;
window.sayWord         = sayWord;
window.playHi          = playHi;
window.changeGreeting  = changeGreeting;

// ============================================================
//   SETTINGS  (API key + voice picking, all client side)
// ============================================================
const settingsEl = document.getElementById('settings');
const voiceBluey = document.getElementById('voice-bluey');
const voiceBingo = document.getElementById('voice-bingo');
const statusEl   = document.getElementById('settings-status');
const toastEl    = document.getElementById('toast');

function openSettings() {
  settingsEl.classList.add('open');
  refreshVoices();
}

function closeSettings() {
  settingsEl.classList.remove('open');
}

function setStatus(msg, isError) {
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('error', !!isError);
}

let toastTimer = null;
function showError(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4000);
}

function setLoading(on) {
  stageEl.classList.toggle('loading', on);
}

async function refreshVoices() {
  setStatus('Loading voices…');
  try {
    const voices = await listVoices();
    const saved  = getVoices();

    [voiceBluey, voiceBingo].forEach(sel => {
      const character = sel === voiceBluey ? 'bluey' : 'bingo';
      sel.innerHTML = '';
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voice_id;
        const traits = [v.labels.age, v.labels.gender, v.labels.accent]
          .filter(Boolean).join(', ');
        opt.textContent = traits ? `${v.name} — ${traits}` : v.name;
        if (saved[character] === v.voice_id) opt.selected = true;
        sel.appendChild(opt);
      });
    });

    // First run: pre-select two different voices so it works immediately.
    if (!saved.bluey && voices[0]) {
      setVoice('bluey', voices[0].voice_id);
      voiceBluey.value = voices[0].voice_id;
    }
    if (!saved.bingo && voices[1]) {
      setVoice('bingo', voices[1].voice_id);
      voiceBingo.value = voices[1].voice_id;
    }

    setStatus(`${voices.length} voices loaded.`);
  } catch (e) {
    setStatus(e.message, true);
  }
}

voiceBluey.addEventListener('change', () => setVoice('bluey', voiceBluey.value));
voiceBingo.addEventListener('change', () => setVoice('bingo', voiceBingo.value));

async function clearAudioCache() {
  await clearCache();
  setStatus('Cached audio cleared.');
}

window.openSettings    = openSettings;
window.closeSettings   = closeSettings;
window.clearAudioCache = clearAudioCache;

// ============================================================
//   STORY TIME
// ============================================================
const storyEl     = document.getElementById('story');
const storyPrompt = document.getElementById('story-prompt');
const storyStatus = document.getElementById('story-status');
const storyTextEl = document.getElementById('story-text');
const storyGoBtn  = document.getElementById('story-go');
const storyLibEl  = document.getElementById('story-library');

function openStory() {
  storyEl.classList.add('open');
  storyPrompt.focus();
  renderLibrary();
}

function closeStory() {
  storyEl.classList.remove('open');
}

async function renderLibrary() {
  const prompts = await listStories();
  storyLibEl.innerHTML = '';
  if (!prompts.length) return;

  const title = document.createElement('p');
  title.className = 'story-library-title';
  title.textContent = 'Told before (free to hear again)';
  storyLibEl.appendChild(title);

  prompts.forEach(p => {
    const b = document.createElement('button');
    b.className = 'story-chip';
    b.dir = 'auto';
    b.textContent = p;
    b.onclick = () => { storyPrompt.value = p; tellStory(); };
    storyLibEl.appendChild(b);
  });
}

async function tellStory() {
  const prompt = storyPrompt.value.trim();
  if (!prompt) {
    storyStatus.textContent = 'Ask for a story first.';
    storyStatus.classList.add('error');
    return;
  }

  storyGoBtn.disabled = true;
  storyStatus.classList.remove('error');
  storyStatus.textContent = 'Writing the story…';
  storyTextEl.textContent = '';

  let story, fromCache;
  try {
    ({ story, fromCache } = await getStory(prompt));
  } catch (e) {
    storyStatus.textContent = e.message;
    storyStatus.classList.add('error');
    storyGoBtn.disabled = false;
    return;
  }

  storyTextEl.textContent = story;
  storyStatus.textContent = 'Bluey is getting ready…';

  await speakStory(story, (part, total) => {
    storyStatus.textContent = `Bluey is reading it… (${part}/${total})`;
  });
  storyStatus.textContent = '';
  storyGoBtn.disabled = false;
  renderLibrary();
}

storyPrompt.addEventListener('keydown', e => {
  if (e.key === 'Enter') tellStory();
});

window.openStory  = openStory;
window.closeStory = closeStory;
window.tellStory  = tellStory;

// Load voices on startup so the first tap already has a voice to speak with.
// speakText awaits this promise rather than racing it.
voicesReady = refreshVoices();

// ============================================================
//   SPARKLES
// ============================================================
const SPARKS = ['⭐', '✨', '🌟', '💫', '🪄'];
function spawnSparkles() {
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const s = document.createElement('div');
      s.className   = 'sparkle';
      s.textContent = SPARKS[Math.floor(Math.random() * SPARKS.length)];
      s.style.left  = (15 + Math.random() * 70) + 'vw';
      s.style.top   = (25 + Math.random() * 45) + 'vh';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }, i * 90);
  }
}

// ============================================================
//   KEYBOARD & SWIPE
// ============================================================
document.addEventListener('keydown', e => {
  // Don't hijack keys while a grown-up is typing a story request.
  const t = e.target;
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;

  if (e.key === 'ArrowLeft')               navigate(-1);
  if (e.key === 'ArrowRight')              navigate(1);
  if (e.key === ' ' || e.key === 'Enter')  sayWord();
});

let touchX = 0;
let touchY = 0;
cardEl.addEventListener('touchstart', e => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}, { passive: true });
cardEl.addEventListener('touchend', e => {
  const dx = touchX - e.changedTouches[0].clientX;
  const dy = touchY - e.changedTouches[0].clientY;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
    navigate(dx > 0 ? 1 : -1);
  }
});

// ============================================================
//   INIT
// ============================================================
updateDisplay(false);
