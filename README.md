# Dastaan

A language learning app for kids built around an animated character. Currently supporting Farsi and Swedish, switchable in Settings, with more languages to come.

**AI-Generated Flashcards.** Create a collection, Colors, Family, whatever your kid is into this week, and add words to it by typing them, in English or in the language you're learning. Translated, illustrated, and voiced, all in one step. Tap a card, the character says the word out loud.

**Tell a bedtime story your way.** Pick a focus like potty training, bedtime, brushing teeth, trying new food, sharing, big feelings and/or type your own idea. The character narrates a short story built around it, in whichever language is active, with a generated image for each part of the story, while your kid just watches and listens, no reading required.

**Talk with the character.** Tap the mic, say something, get a short warm reply back in the same language, spoken aloud. It's an echo, not a test: unclear or unrecognizable speech never gets marked wrong, it's asked for warmly again instead.

**A picture-matching game, built from your own flashcards.** The character says a word, four pictures appear, tap the right one. Skip any word, no penalty. A wrong guess gently shakes and steps aside, no red X, no score against you, just try one of the others. A right guess is a real moment, confetti, the character jumps and cheers, before the next word comes up.

## Screenshots

![Learn screen](docs/screenshot-learn.png)![Story setup screen](docs/screenshot-story-setup.png)![Story playing screen](docs/screenshot-story-playing.png)

## Stack

The client is React 19 + TypeScript (`strict`), built with Vite, tested with Vitest + React Testing Library. The backend is a small dependency-light Node.js server (`server.js`, `node:http`) that also serves the client's production build; no framework there, LangGraph runs the story pipeline (see below). Supabase (Postgres + Auth) holds accounts and each family's data.

## Requirements

| Needed | Version | Why |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 22+ | Runs `server.js`, builds the client. LangGraph's checkpoint code needs the global `crypto` API, which only Node 20+ exposes without a flag. |
| [ElevenLabs API](https://elevenlabs.io/docs) key | n/a | Text-to-speech (`eleven_v3`, needs `text_to_speech` and `voices_read`) and speech-to-text for the Talk tab (`scribe_v2`, make sure Speech to Text access isn't restricted on the key). |
| [OpenAI API](https://platform.openai.com/api-keys) key | n/a | writes the stories, and generates the illustration for each custom flashcard. |
| [Supabase](https://supabase.com) project | n/a | Real accounts (sign in/sign up) and where each family's vocabulary/stories live. Free tier is enough. |

Story prompts and flashcard words are checked with [OpenAI's Moderation API](https://platform.openai.com/docs/guides/moderation) before they reach the story/card generation calls, so nothing inappropriate gets generated (or billed). It's free and uses the same `OPENAI_API_KEY` above, nothing extra to set up.

## How to run

1. Create a free project at [supabase.com](https://supabase.com), then in its SQL Editor run `supabase/schema.sql` from this repo (creates the `collections`/`cards`/`stories` tables and their Row Level Security policies).
2. From Project Settings → API, grab the **Project URL** and the **anon public** key (not `service_role`; that one's only for the migration steps below, never for the running app). They're public by design (Row Level Security is what actually protects the data).

```bash
git clone https://github.com/sogandgh/dastaan.git
cd dastaan
npm install
cp .env.example .env
```

Fill in `.env` with `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and their client-side `VITE_` twins (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, same values, Vite only exposes `VITE_`-prefixed variables to browser code). `.env` is gitignored and never committed; real environment variables (e.g. a systemd `EnvironmentFile`) take precedence over it for the server-side ones, so the same setup works unchanged in production.

**Local development**, client and server running side by side, the Vite dev server proxies `/api/*` to the Node backend:

```bash
node server.js      # backend on :8000
npm run dev          # frontend on :5173, proxying /api to :8000
```

Open **http://localhost:5173**.

**Production**, one server, one origin: build the client first, `server.js` serves the build directly.

```bash
npm run build
node server.js
```

Open **http://localhost:8000**. Either way, it lands on the sign-in page first; create an account to get in. Voices load automatically from your ElevenLabs account; change which one it uses from the ⚙️ panel.

`PORT` overrides the port (default `8000`); `OPENAI_MODEL` overrides the story model (default `gpt-5-mini`); `OPENAI_IMAGE_MODEL` overrides the illustration model (default `gpt-image-1-mini`). All optional, set in `.env` alongside the rest.

## Story pipeline

`POST /api/story` runs on a [LangGraph](https://langchain-ai.github.io/langgraphjs/) graph, `graphs/storyGraph.js`, instead of one long procedural function:

1. `moderateInput`, checks the prompt against the local moderation model.
2. `checkRateLimit`, enforces the per-user story quota.
3. `writeStory`, asks OpenAI for the scenes and character description, retrying once on its own if the reply isn't valid JSON.
4. `generateSceneImage`, one graph node run in parallel per scene, each with its own retry, fanned out with LangGraph's `Send`.
5. `finalizeStory`, gathers the saved image paths back into scene order.

`server.js` calls `runStoryGraph(...)` once and maps the result's `status` to an HTTP response; it no longer talks to OpenAI directly for stories. Flashcard generation (`/api/card`) is still a plain sequence of function calls in `server.js`, it's simple enough that a graph wouldn't add anything.

## Talk pipeline

`POST /api/talk` (`lilyChat.js` + `server.js`'s `handleTalk`) takes a short recorded clip and returns `{transcript, reply}`, both text; the client speaks `reply` itself through the same narrator/TTS path everything else uses.

1. Rate-limited per user before anything else runs, unlike moderation on text input elsewhere in the app, checking whether a recording is even worth transcribing costs real money here (ElevenLabs Scribe), so the limit comes first.
2. The clip goes to ElevenLabs Scribe (`scribe_v2`) for transcription.
3. A transcript under 2 characters is treated as unintelligible speech, not an error: skips moderation and the reply model entirely, and asks the child to try again, no content to judge means nothing to check.
4. Anything longer goes through the same `moderateText()` used for stories and cards. Flagged input never reaches the reply model, the character just warmly changes the subject instead.
5. Clear input gets a real reply from OpenAI, in whatever language is active, one or two short sentences, generated by a prompt parameterized purely by `languageOf(language)`, the same pattern the story and card prompts use, so it needs no changes when a language is added to `languages.js`.

Nothing about a conversation is ever graded or marked wrong. The feature only ever detects that a child said *something*; matching pronunciation or vocabulary against a target was deliberately left out, general-purpose speech recognition is measurably worse on child speech than adult speech, grading against that would mean falsely marking normal, developmentally-expected mispronunciation as wrong. Recorded audio is never written to disk, it's forwarded to ElevenLabs for transcription and discarded.

## Tests

```bash
npm test
```

Runs both suites: `node --test` against `graphs/storyGraph.test.js` (the backend, `fetch` mocked, no real OpenAI or ElevenLabs calls, no API keys required), then `vitest run` against the client's component and hook tests. Run them separately with `npm run test:server` or `npm run test:client`; `npm run typecheck` and `npm run lint` cover the rest of the client's checks.

The backend suite covers moderation rejection, moderation-unavailable, a full run with scene images, the malformed-JSON retry (and giving up after two attempts), rate limiting, an upstream OpenAI error, and a client disconnecting mid-request. The client suite covers the login/auth flow, the language picker shown between login and the main app, the app shell (topbar, modal, settings), flashcards and the add-word flow, story setup/playback including the pause/resume and repeat states, the Talk tab's recorder hook and mic/exchange flow, and the picture-matching game's round-picking logic and correct/wrong/skip flow.
