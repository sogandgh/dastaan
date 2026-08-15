# Farsi with Bluey

A Persian-language app for kids, built around a CSS-drawn Bluey who speaks. Two things
it's for:

**Teach your kid Farsi.** Set it up in a couple of minutes and let your child tap
through animal and body-part flashcards. Bluey says each word aloud in Persian, mouth
moving with the audio.

**Tell them a story your way.** Pick a focus — potty training, bedtime, brushing teeth,
trying new food, sharing, big feelings — or type your own idea, in English or Persian.
Bluey narrates a short Farsi story built around it, while your kid just watches him.

## Screenshots

| Learn | Story setup | Story time |
|---|---|---|
| ![Learn screen](docs/screenshot-learn.png) | ![Story setup screen](docs/screenshot-story-setup.png) | ![Story playing screen](docs/screenshot-story-playing.png) |

## Requirements

**Runtime — nothing to install.** The frontend is plain HTML/CSS/ES modules and the
server (`server.js`) uses only the Node standard library. No `npm install`, no
framework, no build step.

| Needed | Version | Why |
|---|---|---|
| [Node.js](https://nodejs.org) | 18+ | Runs `server.js`. Needs built-in `fetch`. |
| [ElevenLabs API](https://elevenlabs.io/docs) key | — | Text-to-speech. Needs `text_to_speech` and `voices_read` permissions. |
| [OpenAI API](https://platform.openai.com/api-keys) key | — | Writes the Farsi stories. Only needed for the Story tab. |

## How to run

```bash
git clone https://github.com/sogandgh/farsi-bluey.git
cd farsi-bluey
export ELEVENLABS_API_KEY=sk_your_key_here
export OPENAI_API_KEY=sk-your_key_here      # only needed for Story mode
node server.js
```

Open **http://localhost:8000**. Voices load automatically from your ElevenLabs account;
change which one Bluey uses from the ⚙️ panel.

`PORT` overrides the port (default `8000`); `OPENAI_MODEL` overrides the story model
(default `gpt-5-mini`).

> The API keys are read from the environment by the server and never reach the browser.
> There is no key anywhere in this repo and no config file to put one in.

To reach it from a phone on the same wifi, use your computer's LAN IP instead of
`localhost`, e.g. `http://10.0.0.108:8000`.

## Adding vocabulary

Add an entry to the relevant array in `app.js`, and drop the image in `pictures/`:

```js
{ img: 'pictures/animals/duck.png', word: 'اردک' }
```

No recording needed — the word is synthesised the first time it's tapped, then cached.

## Notes

Persian is only supported by the `eleven_v3` model, so the TTS model is fixed. Bluey's
mouth is driven by the loudness of the audio itself (a Web Audio `AnalyserNode`), not by
a canned animation.

Bluey is a creation of [Ludo Studio](https://www.ludostudio.com.au/). This is an
unaffiliated personal project made for my own kid, not endorsed by or connected to the
rights holders, and not for commercial use.
