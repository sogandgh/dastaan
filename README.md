# Learn with Bluey

A tiny Persian-language flashcard app for my daughter, with a CSS-drawn Bluey who
says each word out loud using the [ElevenLabs](https://elevenlabs.io) API.

Tap a picture, hear the Farsi word, watch Bluey's mouth move along with it.

## Why this exists

I wanted my daughter to hear Farsi words spoken clearly and repeatedly, on demand,
without me having to be in the room to say them. The first version of this app played
back voice memos I recorded on my phone. That worked, but it didn't scale: every new
word meant a new recording, the clips drifted in volume and pacing, and adding a second
character meant recording everything twice.

Now the words are synthesised. Adding a word is one line in `app.js`.

## How it works

**No build step, no dependencies, no backend.** It is HTML, CSS and three JS modules,
served as static files. That was a deliberate constraint — I wanted it to still run
in five years without a dependency install.

### Speech

`tts.js` wraps the ElevenLabs text-to-speech API.

- **Model: `eleven_v3`, not configurable.** Persian (`fas`) is only supported by v3 —
  it isn't in the language list for `eleven_multilingual_v2` or the flash/turbo models.
  This is the one real constraint the app is built around.
- **Speed is dialled down to `0.9`.** These are words a two-year-old is hearing for the
  first time; default pacing was too quick to imitate.
- **Every clip is cached in IndexedDB**, keyed by `model|voice|text`. A word is
  synthesised once per browser and is free and instant forever after. This matters more
  than it sounds: without it, a toddler tapping the same picture forty times in a row
  would burn forty times the credits for identical audio.
- **Neighbouring words are prefetched.** When a card is shown, the next and previous
  words are warmed in the background, so arrowing through the deck has no latency.
- **Each character gets its own voice**, picked at runtime from `GET /v2/voices`.

### Lip sync

Bluey's mouth is driven by `data-mouth` on the character element, cycling through four
viseme shapes for the duration of the returned clip. It is not phoneme-accurate — it
reads as talking, which is all a two-year-old needs.

### The character

Bluey is drawn entirely in CSS (`bluey.css`) — no character images, just positioned and
rounded divs. Bingo is the same markup re-skinned via a `.bingo-mode` class.

## Running it

```bash
git clone <this repo>
cd bluey
python3 -m http.server 8000
```

Open `http://localhost:8000`. It must be served over HTTP rather than opened as a
`file://` URL, because it uses ES modules.

Then click the ⚙️ button and paste an ElevenLabs API key.

### About the API key

The key is stored in your browser's `localStorage` and sent only to `api.elevenlabs.io`.
**There is no key in this repository and no place to put one** — that is intentional,
since this repo is public.

The free ElevenLabs tier is enough to run this app. The full vocabulary is about 136
characters of Persian text, so generating every word costs ~136 credits against a
10,000/month allowance, and the IndexedDB cache means you only pay that once.

## Adding words

Add an entry to the relevant array in `app.js`:

```js
{ img: 'pictures/animals/duck.png', word: 'اردک' }
```

That's the whole change. No recording, no audio file, no manifest to update.

## Project layout

```
index.html      markup + settings panel
app.js          state, navigation, lip sync, settings wiring
tts.js          ElevenLabs client, IndexedDB cache, voice listing
bluey.css       the CSS Bluey/Bingo character
style.css       layout, scene, settings panel, toast
greetings.json  greeting phrases per character
pictures/       flashcard images
```

## Notes

Bluey is a creation of [Ludo Studio](https://www.ludostudio.com.au/). This is an
unaffiliated personal project made for my own child, not endorsed by or connected to the
rights holders, and is not for commercial use.
