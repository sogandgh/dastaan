# Farsi Bluey

A Persian flashcard app for kids. Tap a card and a CSS-drawn Bluey speaks the Farsi word
out loud, using the ElevenLabs text-to-speech API.

![Farsi Bluey](docs/screenshot.png)

## What it does

- Two decks — **animals** and **face & body** — with pictures and Farsi words.
- Two characters, **Bluey** and **Bingo**, each with its own ElevenLabs voice.
- Tap a card to hear the word; tap the character to hear a greeting.
- The character's mouth animates while it speaks.
- Navigate with arrows, arrow keys, or swipe.
- Every clip is cached in IndexedDB, so each word is only generated once.

## Requirements

- **Node.js 18+** (needs built-in `fetch`)
- An **[ElevenLabs API key](https://elevenlabs.io/app/settings/api-keys)** with the
  `text_to_speech` and `voices_read` permissions

Nothing to `npm install` — the frontend is plain HTML/CSS/ES modules and the server uses
only the Node standard library.

## Install

```bash
git clone https://github.com/sogandgh/farsi-bluey.git
cd farsi-bluey
export ELEVENLABS_API_KEY=sk_your_key_here
node server.js
```

Open **http://localhost:8000**. Voices load automatically; use the ⚙️ panel to change
which voice each character uses.

To avoid setting the key each time, add the `export` line to your `~/.zshrc`.
To open it on a phone on the same wifi, use your computer's LAN IP instead of
`localhost` (e.g. `http://10.0.0.108:8000`).

> The API key is read from the environment by the server and never reaches the browser.
> There is no key in this repo and no config file to put one in.

## Adding words

Add an entry to the relevant array in `app.js` and drop the image in `pictures/`:

```js
{ img: 'pictures/animals/duck.png', word: 'اردک' }
```

No recording needed — the word is synthesised on first use.

## Notes

Persian is only supported by the `eleven_v3` model, so the model is fixed.

Bluey is a creation of [Ludo Studio](https://www.ludostudio.com.au/). This is an
unaffiliated personal project, not endorsed by the rights holders, and not for
commercial use.
