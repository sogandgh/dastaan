# Dastaan

A language learning app for kids built around an animated character that does three things:

**AI-Generated Flashcards.** Create a collection, Colors, Family, whatever your kid is into this week, and add words to it by typing them, in English or Persian. Translated, illustrated, and voiced, all in one step. Tap a card, the character says the word in Farsi.

**Tell a bedtime story your way.** Pick a focus like potty training, bedtime, brushing teeth, trying new food, sharing, big feelings and/or type your own idea. The character narrates a short Farsi story built around it, with a generated image for each part of the story, while your kid just watches and listens, no reading required.

## Screenshots

![Learn screen](docs/screenshot-learn.png)![Voice settings screen](docs/screenshot-voice.png)![Story setup screen](docs/screenshot-story-setup.png)![Story playing screen](docs/screenshot-story-playing.png)## Requirements

| Needed | Version | Why |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 18+ | Runs `server.js` |
| [ElevenLabs API](https://elevenlabs.io/docs) key | — | Text-to-speech model. Needs `text_to_speech` and `voices_read` permissions. Model is `eleven_v3`.  |
| [OpenAI API](https://platform.openai.com/api-keys) key | — |  writes the Farsi stories, and generates the illustration for each custom flashcard. |

## How to run

```bash
git clone https://github.com/sogandgh/dastaan.git
cd dastaan
export ELEVENLABS_API_KEY=sk_your_key_here
export OPENAI_API_KEY=sk-your_key_here
node server.js
```

Open **http://localhost:8000**. Voices load automatically from your ElevenLabs account; change which one it uses from the ⚙️ panel.

`PORT` overrides the port (default `8000`); `OPENAI_MODEL` overrides the story model (default `gpt-5-mini`); `OPENAI_IMAGE_MODEL` overrides the illustration model (default `gpt-image-1-mini`).

To reach it from a phone on the same wifi, use your computer's LAN IP instead of `localhost`, e.g. `http://10.0.0.108:8000`.

## Notes

Bluey is a creation of [Ludo Studio](https://www.ludostudio.com.au/). This is an unaffiliated personal project, not endorsed by or connected to the rights holders, and not for commercial use.