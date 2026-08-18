# Dastaan

A language learning app for kids built around an animated character. Currently supporting Farsi and Swedish, switchable in Settings, with more languages to come.

**AI-Generated Flashcards.** Create a collection, Colors, Family, whatever your kid is into this week, and add words to it by typing them, in English or in the language you're learning. Translated, illustrated, and voiced, all in one step. Tap a card, the character says the word out loud.

**Tell a bedtime story your way.** Pick a focus like potty training, bedtime, brushing teeth, trying new food, sharing, big feelings and/or type your own idea. The character narrates a short story built around it, in whichever language is active, with a generated image for each part of the story, while your kid just watches and listens, no reading required.

## Screenshots

![Learn screen](docs/screenshot-learn.png)![Story setup screen](docs/screenshot-story-setup.png)![Story playing screen](docs/screenshot-story-playing.png)\## Requirements

| Needed | Version | Why |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 18+ | Runs `server.js` |
| [ElevenLabs API](https://elevenlabs.io/docs) key | n/a | Text-to-speech model. Needs `text_to_speech` and `voices_read` permissions. Model is `eleven_v3`. |
| [OpenAI API](https://platform.openai.com/api-keys) key | n/a | writes the stories, and generates the illustration for each custom flashcard. |
| [Supabase](https://supabase.com) project | n/a | Real accounts (sign in/sign up) and where each family's vocabulary/stories live. Free tier is enough. |

## How to run

1. Create a free project at [supabase.com](https://supabase.com), then in its SQL Editor run `supabase/schema.sql` from this repo (creates the `collections`/`cards`/`stories` tables and their Row Level Security policies).
2. From Project Settings → API, grab the **Project URL** and the **anon public** key (not `service_role`; that one's only for the migration steps below, never for the running app). They're public by design (Row Level Security is what actually protects the data).

```bash
git clone https://github.com/sogandgh/dastaan.git
cd dastaan
npm install
cp .env.example .env
```

Fill in `.env` with the four values above (`ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`). `.env` is gitignored and never committed; real environment variables (e.g. a systemd `EnvironmentFile`) take precedence over it, so the same setup works unchanged in production.

```bash
node server.js
```

Open **http://localhost:8000**. It lands on the sign-in page first; create an account to get in. Voices load automatically from your ElevenLabs account; change which one it uses from the ⚙️ panel.

`PORT` overrides the port (default `8000`); `OPENAI_MODEL` overrides the story model (default `gpt-5-mini`); `OPENAI_IMAGE_MODEL` overrides the illustration model (default `gpt-image-1-mini`). All optional, set in `.env` alongside the rest.