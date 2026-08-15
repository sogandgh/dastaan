# Farsi with Bluey

A Persian-language learning app built around a CSS-drawn Bluey who actually talks — real
ElevenLabs voice, mouth moving to the audio, not a recording. Three things it does:

**Teach your kid Farsi.** Animal and body-part flashcards, ready out of the box. Tap a
card, Bluey says the word in Persian.

**Grow the vocabulary yourself.** Create a collection — Colors, Family, whatever your
kid is into this week — and add words to it by typing them, in English or Persian.
Bluey translates it, generates an illustration for it, and learns to say it, all in one
step.

**Tell a bedtime story your way.** Pick a focus — potty training, bedtime, brushing
teeth, trying new food, sharing, big feelings — or type your own idea. Bluey narrates a
short Farsi story built around it while your kid just watches him, no reading required.

## Screenshots

![Learn screen](docs/screenshot-learn.png)

![Voice settings screen](docs/screenshot-voice.png)

![Story setup screen](docs/screenshot-story-setup.png)

![Story playing screen](docs/screenshot-story-playing.png)

## Requirements

| Needed | Version | Why |
|---|---|---|
| [Node.js](https://nodejs.org) | 18+ | Runs `server.js`. Needs built-in `fetch`. |
| [ElevenLabs API](https://elevenlabs.io/docs) key | — | Text-to-speech — voices every word and story. Needs `text_to_speech` and `voices_read` permissions. Model is `eleven_v3`, the only one that speaks Persian; stories are written with inline delivery tags (`[giggles]`, `[whispers]`, `[excited]`, …) that v3 reads as performance direction rather than speaking aloud. |
| [OpenAI API](https://platform.openai.com/api-keys) key | — | Used twice: writes the Farsi stories (and the delivery tags above), and generates the illustration for each custom flashcard. |

## How to run

```bash
git clone https://github.com/sogandgh/farsi-bluey.git
cd farsi-bluey
export ELEVENLABS_API_KEY=sk_your_key_here
export OPENAI_API_KEY=sk-your_key_here
node server.js
```

Open **http://localhost:8000**. Voices load automatically from your ElevenLabs account;
change which one Bluey uses from the ⚙️ panel.

`PORT` overrides the port (default `8000`); `OPENAI_MODEL` overrides the story model
(default `gpt-5-mini`); `OPENAI_IMAGE_MODEL` overrides the illustration model (default
`gpt-image-1-mini`).

To reach it from a phone on the same wifi, use your computer's LAN IP instead of
`localhost`, e.g. `http://10.0.0.108:8000`.

## Adding vocabulary

The app ships with two ready-made decks — animals and face & body. Beyond that, add
words from inside the app:

1. Tap **+** next to the deck tabs and name a new collection.
2. Tap the **+** beside the card to add a word to it — type it in English or Persian.
3. Bluey shows you the translation and the picture he generated. Confirm it, or try
   another word.

Every collection and card is saved on the server, in `data/vocabulary.json` and
`data/images/`. Any device that opens the app sees the same words

## Notes

Persian is only supported by ElevenLabs' `eleven_v3` model, so that's the TTS model this
app is built around.

Bluey is a creation of [Ludo Studio](https://www.ludostudio.com.au/). This is an
unaffiliated personal project, not endorsed by or connected to the rights holders, and
not for commercial use.
