# Learn with Bluey

A Persian-language flashcard web app. Each card shows a picture and a Farsi word, and
an animated CSS-drawn Bluey speaks the word aloud using the ElevenLabs text-to-speech
API. Built to teach my daughter her first Farsi vocabulary.

![Learn with Bluey](docs/screenshot.png)

## What it does

- **Two decks** — nine animals and eleven face/body parts, navigable by arrows, arrow
  keys, or swipe on touch devices.
- **Two characters** — Bluey and Bingo, each assigned its own ElevenLabs voice. Switching
  character also switches deck.
- **Spoken words on demand** — tapping a card synthesises and plays the Farsi word.
  Tapping the character plays a greeting.
- **Lip sync** — the character's mouth animates for the duration of the returned audio,
  cycling through four viseme shapes.

## Dependencies

There is **no package manager and nothing to `npm install`** — the frontend is plain
HTML, CSS and ES modules, and the server uses only the Node standard library.

| Dependency | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org) | 18+ | Runs `server.js`. Needs built-in `fetch`, so 18 or newer. |
| [ElevenLabs API](https://elevenlabs.io/docs) | — | Text-to-speech. Requires an API key; the free tier is sufficient. |
| Google Fonts (Nunito, Vazirmatn) | — | Latin + Persian typefaces, loaded via CDN in `index.html`. Vazirmatn renders the Farsi text. |
| A modern browser | — | Needs ES modules, IndexedDB and `fetch`. |

`server.js` does two jobs: it serves the static files, and it proxies the two ElevenLabs
endpoints so the API key stays on the server. The app must be loaded over HTTP rather
than as a `file://` URL, because ES modules and `fetch()` are blocked on that scheme.

## ElevenLabs integration

The API calls live in `server.js`; `tts.js` is the browser-side client that talks to it
and manages the cache.

| Detail | Value |
|---|---|
| Synthesis endpoint | `POST /v1/text-to-speech/{voice_id}` |
| Voice listing endpoint | `GET /v2/voices` |
| Model | `eleven_v3` |
| Output format | `mp3_44100_128` |
| Voice settings | `stability: 0.5`, `similarity_boost: 0.75`, `speed: 0.9` |

The browser calls two local endpoints instead of ElevenLabs directly:

| Local endpoint | Proxies to |
|---|---|
| `GET /api/voices` | `GET /v2/voices` |
| `POST /api/tts` | `POST /v1/text-to-speech/{voice_id}` |

**The model is fixed at `eleven_v3` and is not configurable.** Persian (`fas`) is only
listed as a supported language for v3 — it is absent from `eleven_multilingual_v2` and
the flash/turbo models. Speed is reduced to `0.9` because default pacing is too fast for
a small child to imitate.

### Caching

Every synthesised clip is stored in IndexedDB (database `bluey-tts`, store `clips`) under
the key `model|voice|text`. A word is therefore requested from the API once per browser;
every later playback is served from the cache, costing nothing and starting instantly.
When a card is displayed, the next and previous words are prefetched in the background.

Without this, a child tapping the same picture repeatedly would re-request identical
audio every time. Cached clips can be dropped from the settings panel.

### Cost

The complete vocabulary is roughly 136 characters of Persian text. At 1 credit per
character that is ~136 credits to generate everything once, against the free tier's
10,000 credits per month.

## Setting the API key

The key is read from the **`ELEVENLABS_API_KEY`** environment variable by `server.js`.
It is never sent to the browser and never written to disk by this project.

Get a key from [ElevenLabs → API Keys](https://elevenlabs.io/app/settings/api-keys), then
pass it when starting the server:

```bash
ELEVENLABS_API_KEY=sk_your_key_here node server.js
```

To avoid repeating it, export it in your shell session:

```bash
export ELEVENLABS_API_KEY=sk_your_key_here
node server.js
```

Or make it permanent by adding that `export` line to `~/.zshrc` (then
`source ~/.zshrc`).

If the variable is missing the server still starts and the app still loads — it prints a
warning and the settings panel explains why nothing is speaking.

`PORT` is also configurable and defaults to `8000`.

> **There is no API key in this repository and no config file to put one in.** The repo
> is public, so `.gitignore` also blocks `.env`, `*.key` and similar files to prevent a
> local credential being committed by accident.

## Setup

```bash
git clone https://github.com/sogandgh/bluey.git
cd bluey
ELEVENLABS_API_KEY=sk_your_key_here node server.js
```

1. Open `http://localhost:8000`.
2. Voices load automatically from your ElevenLabs account, and one is assigned to each
   character.
3. To change them, open the ⚙️ panel and pick a voice for Bluey and Bingo. The choice is
   remembered in `localStorage`.

## Adding vocabulary

Add an entry to the relevant array in `app.js`:

```js
{ img: 'pictures/animals/duck.png', word: 'اردک' }
```

Drop the image in `pictures/`. No audio file, recording, or manifest update is needed —
the word is synthesised on first use. Greetings live in `greetings.json` and are
text-only in the same way.

## Project structure

```
server.js       static file server + ElevenLabs proxy (holds the API key)
index.html      markup, settings panel, font + script loading
app.js          state, navigation, lip sync, settings wiring
tts.js          browser-side speech client + IndexedDB cache
bluey.css       the Bluey/Bingo character, drawn entirely in CSS
style.css       layout, background scene, settings panel, toast
greetings.json  greeting phrases per character
pictures/       flashcard images
```

`bluey.css` builds both characters out of positioned and rounded `div`s — there are no
character images. Bingo is the same markup re-skinned through a `.bingo-mode` class.

## Browser support

Requires ES modules, IndexedDB and `fetch`. Tested in Chrome and Safari. Because browsers
block autoplay before a user gesture, the greeting on page load may stay silent until the
first tap.

## Licence and attribution

Bluey is a creation of [Ludo Studio](https://www.ludostudio.com.au/). This is an
unaffiliated personal project, not endorsed by or connected to the rights holders, and is
not intended for commercial use.
