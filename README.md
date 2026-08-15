# Farsi Bluey

A Persian flashcard app for kids. Tap a card and a CSS-drawn Bluey speaks the Farsi word
out loud, using the ElevenLabs text-to-speech API.

![Farsi Bluey](docs/screenshot.png)

## What it does

**Learn** — two decks, *animals* and *face & body*. Tap a card to hear the Farsi word,
or tap Bluey for a greeting. Navigate with arrows, arrow keys, or swipe.

**Story** — pick a focus (potty training, sleep, brushing teeth, new food, sharing, big
feelings), choose 1–3 minutes, or type any request in English *or* Persian. GPT writes
the story in Persian and Bluey reads it aloud while the screen dims to a warm glow.
Stories you've made are listed so they can be replayed for free.

Bluey's mouth is driven by the loudness of the audio itself, so it follows the voice
rather than cycling through canned shapes. Every clip is cached in IndexedDB, so a word
or a re-told story is only ever generated once.

## Requirements

- **Node.js 18+** (needs built-in `fetch`)
- An **[ElevenLabs API key](https://elevenlabs.io/app/settings/api-keys)** with the
  `text_to_speech` and `voices_read` permissions
- An **[OpenAI API key](https://platform.openai.com/api-keys)** — only needed for stories

Nothing to `npm install` — the frontend is plain HTML/CSS/ES modules and the server uses
only the Node standard library.

## Install

```bash
git clone https://github.com/sogandgh/farsi-bluey.git
cd farsi-bluey
export ELEVENLABS_API_KEY=sk_your_key_here
export OPENAI_API_KEY=sk-your_key_here      # stories only
node server.js
```

`OPENAI_MODEL` overrides the story model (default `gpt-5-mini`); `PORT` defaults to 8000.

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
