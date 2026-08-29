# Dastaan roadmap

Living document. Update this when priorities change instead of letting the
plan live only in chat history, multiple sessions work on this repo and
none of them share memory.

## Status legend

- ✅ done and deployed
- 🟡 done, not deployed yet
- ⬜ not started

## Production readiness (target: ~200 real users)

Ordered by actual impact, not by how easy each one is.

1. ✅ **HTTPS.** Done, no purchased domain needed: `nip.io` gives a real
   hostname (`134-199-143-137.nip.io`) that resolves straight to the
   droplet's IP, free, no registration, which is all Let's Encrypt
   needs for a normal domain-validated cert (the standard 90-day kind,
   not the newer 160-hour bare-IP certs, less renewal to babysit).
   nginx (already installed on the droplet from an older project) now
   reverse-proxies 80/443 to the app; `server.js` was rebound from
   `0.0.0.0` to `127.0.0.1` (a `HOST` env var, defaults to localhost)
   so the app is only reachable through nginx, not directly on `:8000`
   anymore, otherwise the whole point of adding HTTPS is one port
   number away from being moot. Renewal is Certbot's own systemd
   timer, already confirmed active. A purchased domain is still worth
   doing eventually for a nicer URL, but it's no longer blocking
   anything.
2. ⬜ **Bigger droplet.** Currently 512MB, already fragile, too tight for
   concurrent image generation. No longer blocking moderation specifically
   (see Features shipped) but still worth doing for general headroom.
   Confirmed the hard way deploying the React client: `tsc -b`/`vite build`
   get OOM-killed on this box. Deploys now build `dist/` locally and
   `rsync` it over rather than building on the droplet, works fine, but
   it means the droplet can never build its own client until this is
   bigger, worth knowing before scripting deploys further.
3. ✅ **Node 18 → 22+ on the droplet.** Done. Turned out to be a hard
   blocker, not just a deprecation warning: LangGraph's checkpoint code
   needs the global `crypto` API, which Node 18 doesn't expose, so
   every `/api/story` request was throwing `crypto is not defined`
   until this landed.
4. ⬜ **Supabase paid tier.** Free tier auto-pauses after a week of
   inactivity, thin backup guarantees.
5. ⬜ **CI.** `npm test` exists and passes locally now (see Testing
   below) but nothing runs it automatically on push. Even a bare-bones
   GitHub Actions workflow running `npm test` closes most of the gap.
6. ⬜ **Move generated images and cached audio off local disk**
   (Supabase Storage or a cheap object store like R2). Right now: no
   CDN, no redundancy, grows until the disk fills, single point of
   failure if the droplet dies. The single biggest scaling risk in the
   current design. The audio cache (see Features shipped) grows more
   slowly than images, small mp3 clips, but it's the same risk.
7. ⬜ **Error alerting.** Server errors are logged to
   `data/errors.log`, tagged with the reporting user's email (grep-able
   when someone reports a problem), but nothing notifies anyone when the
   log grows. Right now the only way to learn something broke is a user
   complaining.
8. ⬜ **Log rotation.** `errors.log` grows forever currently.
9. ⬜ Revisit open signup now that rate limiting + moderation both exist.
10. ⬜ A real privacy policy (kids' product, handles emails + generated
    content).
11. ⬜ Spend caps/alerts set directly in the OpenAI and ElevenLabs
    dashboards, as a backstop above the per-user rate limiter.

## Deployed

Live at **https://134-199-143-137.nip.io** (nginx in front, real
Let's Encrypt cert, see item 1 above), backed by `/root/farsi-bluey` on
the droplet (`farsi-bluey.service`), running `main` as of commit
`62bb7d8`, Node 22. The old `http://134.199.143.137:8000` direct URL no
longer works on purpose, the app now only listens on localhost, nginx
is the only public entry point. The client is the React build (`dist/`,
built locally and `rsync`'d over, see item 2 above), server-side code
otherwise unchanged.

## Features shipped

- ✅ Real accounts (Supabase Auth + Postgres, Row Level Security)
- ✅ Multi-language support (Farsi + Swedish), one shared registry
  (`languages.js`) drives UI text/direction/font and the story/translation
  prompts, so adding a language is a data-only change in one file plus a
  Swedish-equivalent word bank in `src/lib/builtinWords.ts`
- ✅ Per-user rate limiting (`rateLimiter.js`): 15 flashcards/hour, 5
  stories/day
- ✅ Content moderation (`moderation.js`): blocklist fast path +
  [OpenAI's Moderation API](https://platform.openai.com/docs/guides/moderation).
  Originally built on a locally-hosted Llama Guard 3 1B via Ollama, but
  switched after head-to-head testing on the same real cases showed
  OpenAI's free endpoint matched or beat it (including a case Llama
  Guard's default categories missed entirely), with none of the RAM/
  infra cost of self-hosting. Uses the same `OPENAI_API_KEY` already
  required, nothing extra to run.
- ✅ Server refactor + testing (committed): `server.js` split into
  `env.js` / `messages.js` / `providerClient.js` / `imageStore.js`;
  story generation rebuilt as a LangGraph pipeline
  (`graphs/storyGraph.js`) instead of one long procedural function; a
  real test suite (`graphs/storyGraph.test.js`, Node's built-in test
  runner, mocked `fetch`, no real API calls) covering moderation
  rejection, the moderation-unavailable path, malformed-JSON retry, rate
  limiting, upstream errors, and client disconnects.
- ✅ Client rewritten in React + TypeScript. Vite build, `strict`
  TypeScript, Vitest + React Testing Library. Same backend, same
  `/api/*` contract, no server-side behavior changes beyond how
  `server.js` serves the client (Vite's `dist/` build plus an SPA
  fallback, replacing the old raw-file static handler). Every screen
  ported and covered by real tests: login/auth/routing, the app shell
  (topbar, settings, the audio/lip-sync engine driving the Lily
  mascot), flashcards and the add-word flow, story setup and playback.
  Merged to `main` and deployed without a live click-through of the
  authenticated screens first (couldn't create a throwaway Supabase
  test account, this project validates signup email domains for real),
  verified instead by a real test suite plus a clean build/console at
  every step. Worth an actual pass through the live app soon to catch
  anything that only shows up with a real signed-in session.
- ✅ Server-side audio cache (`audioCache.js`): `/api/tts` used to be a
  pure passthrough to ElevenLabs, so the same story replayed on a
  second device, or after clearing browser storage, cost a fresh
  ElevenLabs call every time, the client's IndexedDB cache was the
  only cache and it's per-browser. Now caches by a hash of
  `voiceId + text` under `data/audio-cache/`, shared globally rather
  than per-user (the same word in the same voice is the same audio no
  matter who asks), so any given line only ever costs ElevenLabs once,
  ever. Verified against the real ElevenLabs API: first request ~1.4s
  and a real API call, an identical second request ~1ms served
  straight from disk, bytes identical, confirmed only one real
  ElevenLabs call happened for both.
- ✅ Full vowel diacritics (اعراب) in generated Farsi (`languages.js`'s
  `diacriticsNote`, wired into the story and card-translate prompts):
  Persian script normally omits short vowels, fine for a fluent reader,
  not much help for a kid sounding words out. Empty for Swedish, that
  script already writes every vowel. Verified with real OpenAI calls,
  not just by reading the prompt, both single flashcard words and a
  full multi-scene story came back consistently vowel-marked.
- ✅ Talk tab (`lilyChat.js`, `POST /api/talk`, `TalkPanel.tsx`): tap a
  mic, say something, get a short warm spoken reply, using ElevenLabs
  Scribe (`scribe_v2`) for speech-to-text since it's already the same
  vendor as narration and its docs confirm both Farsi and Swedish are
  covered. Deliberately not a pronunciation test, general ASR is
  measurably worse on child speech than adult speech (studies put
  Whisper around 25% word-error-rate on kids' voices vs ~3% on adult),
  so grading against a target word would routinely mark normal
  toddler mispronunciation as wrong. It only ever detects that the
  child said *something*; an unclear or empty transcript gets a warm
  "say that again?" instead of an error. Every transcript over 2
  characters goes through the same `moderateText()` gate stories and
  cards use before any reply gets generated; flagged input never
  reaches the reply model, the character just changes the subject.
  The reply prompt is parameterized purely by `languageOf(language)`,
  same pattern as the story/card prompts, verified generic (not
  secretly fa/sv-specific) by running it against a fake third
  language that isn't in the app at all. Recorded audio is forwarded
  to ElevenLabs and discarded, never written to disk.

## Testing

```bash
npm test
```

Runs both suites: `node --test` against `graphs/storyGraph.test.js`
(the backend, no API keys required, no real OpenAI or ElevenLabs
calls, `fetch` is mocked), then `vitest run` against the client's
component and hook tests. `npm run test:server` / `npm run test:client`
run them separately; `npm run typecheck` and `npm run lint` cover the
rest of the client's checks. Extend `graphs/storyGraph.test.js` (or add
siblings next to it) as more of `server.js` gets pulled apart the same
way the story pipeline was; add client tests next to the component or
hook they cover, same pattern as the rest of `src/`.
