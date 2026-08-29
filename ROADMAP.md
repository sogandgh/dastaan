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
- ❌ Full vowel diacritics (اعراب) in generated Farsi, shipped then
  removed. Added to help early readers sound out words, but real usage
  showed it made ElevenLabs' narration sound weird, and the same
  generation pass had also let colloquial spoken-dialect contractions
  slip in (`دیگه` instead of the correct formal `دیگر`), which is its
  own separate problem from diacritics. Both are gone now: no
  `diacriticsNote` field anywhere, and the story, card-translate, and
  Talk-tab prompts (`graphs/storyGraph.js`, `server.js`, `lilyChat.js`)
  all now explicitly require standard formal language, never a regional
  dialect or colloquial contraction, for every supported language, not
  just Farsi. `languages.js`'s `celebrationLine`/`tryAgainLine` were
  regenerated clean and reverified for the same issue.
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
- ✅ Game tab (`GamePanel.tsx`, `lib/game.ts`, `lib/random.ts`): a
  picture-matching game built entirely from the existing flashcards
  (`useVocabulary`, no new data source). The character says a word,
  four pictures appear, one right answer plus three distractors
  guaranteed to have visually distinct images (`pickRound` refuses to
  deal a round it can't make fair). Round selection is plain
  `Math.random`, no AI involved, and `useVocabulary` refetches from
  the server on every mount, so opening the Game tab always pulls
  whatever flashcards exist at that moment, newly added ones included,
  with no extra wiring needed. A wrong tap shakes once, dims out, and
  stays disabled, the round keeps going with the remaining options,
  never a hard fail or a score held against the child. A right tap
  triggers Lily's `jumping`/`waving` CSS animations (both written for
  the original vanilla app, ported over in the React migration, never
  actually triggered by anything until now) and a full-screen
  celebration (`CelebrationOverlay.tsx`): a purple gradient wash
  covering the whole viewport, a pulsing light/shimmer effect, and one
  of three particle styles (sprinkles, stars, or balloons, picked at
  random each time for variety) filling the screen, replacing an
  earlier version that was a faint color tint confined to roughly the
  card area. Both the celebration line and the wrong-answer line are a
  single fixed string per language (`languages.js`'s `celebrationLine`
  and `tryAgainLine`, deterministic rather than a random pick from
  several), generated once via a real OpenAI call and reused forever
  after: `GamePanel` prefetches both (`narrator.prefetchLine`) the
  moment the tab opens, and the server's content-addressed audio cache
  (`audioCache.js`, keyed on `sha256(voiceId + text)`) serves them from
  disk after the first real ElevenLabs call, so neither line ever waits
  on a network round-trip during play. Both fields are read purely off
  `languageOf(language)`, verified generic by testing against a fake
  language not in the real registry, see `CLAUDE.md` for the full
  language-addition checklist this drove. Skip always available, no
  penalty, just deals a new round.
- ✅ Language picker between login and the main app
  (`ChooseLanguagePage.tsx`): every time `HomePage` mounts (fresh page
  load, or a sign-out/sign-in cycle in the same tab), the app asks
  which language before showing anything else, one full-screen tap per
  language in `LANGUAGES`, no hardcoded list. Tapping persists the pick
  (the same `localStorage` key `SettingsModal`'s language dropdown
  already used) and proceeds straight to the app shell.
- ✅ More accurate flashcard pictures (`server.js`'s
  `buildTranslatePrompt`/`generateCardImage`): the image generator used
  to just get handed the raw translated word, which works for a
  concrete noun ("apple") but breaks badly for anything else, a color
  word like "yellow" came back as a picture of a yellow duck, risking
  the child associating the word with "duck" instead of the color, and
  a phrase like "do you remember" came back as an arbitrary unrelated
  object (a bow) since there's nothing literal to draw. The
  card-translate prompt now returns a dedicated `image` field, written
  by the same model that already understands what the word means:
  concrete nouns get a simple direct depiction, color words on their
  own get an abstract color swatch with no object at all, other
  qualities (big, happy, cold) get a simple universal icon for that
  quality instead of a random carrier object, verbs get a figure
  performing the action, and phrases/idioms get a simple symbolic scene
  (a thought bubble with a photo for "do you remember", clasped hands
  for "thank you"). Verified against real OpenAI calls on the exact
  reported cases plus a few more, including a fake third language to
  confirm the fix isn't fa/sv-specific.

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
