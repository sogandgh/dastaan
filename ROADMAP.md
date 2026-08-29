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

1. ⬜ **HTTPS + a real domain.** The app is plain `http://` right now.
   Real email/password auth over cleartext isn't okay at any user count.
   Needs a domain, nginx (already installed on the droplet from an older
   project) as a reverse proxy, and a free Let's Encrypt cert.
2. ⬜ **Bigger droplet.** Currently 512MB, already fragile, too tight for
   concurrent image generation. No longer blocking moderation specifically
   (see Features shipped) but still worth doing for general headroom.
3. ⬜ **Node 18 → 22+ on the droplet.** Already broke once (the
   `supabase-js` WebSocket polyfill). Supabase is actively dropping
   support for <20.
4. ⬜ **Supabase paid tier.** Free tier auto-pauses after a week of
   inactivity, thin backup guarantees.
5. ⬜ **CI.** `npm test` exists and passes locally now (see Testing
   below) but nothing runs it automatically on push. Even a bare-bones
   GitHub Actions workflow running `npm test` closes most of the gap.
6. ⬜ **Move generated images off local disk** (Supabase Storage or a
   cheap object store like R2). Right now: no CDN, no redundancy, grows
   until the disk fills, single point of failure if the droplet dies.
   The single biggest scaling risk in the current design.
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

## Features shipped

- ✅ Real accounts (Supabase Auth + Postgres, Row Level Security)
- ✅ Multi-language support (Farsi + Swedish), one shared registry
  (`languages.js`) drives UI text/direction/font and the story/translation
  prompts, so adding a language is a data-only change in one file plus a
  Swedish-equivalent word bank in `app.js`
- ✅ Per-user rate limiting (`rateLimiter.js`): 15 flashcards/hour, 5
  stories/day
- 🟡 Content moderation (`moderation.js`): blocklist fast path +
  [OpenAI's Moderation API](https://platform.openai.com/docs/guides/moderation).
  Originally built on a locally-hosted Llama Guard 3 1B via Ollama, but
  switched after head-to-head testing on the same real cases showed
  OpenAI's free endpoint matched or beat it (including a case Llama
  Guard's default categories missed entirely), with none of the RAM/
  infra cost of self-hosting. Uses the same `OPENAI_API_KEY` already
  required, nothing extra to run. Ready to deploy, no longer blocked on
  the RAM upgrade.
- ✅ Server refactor + testing (committed): `server.js` split into
  `env.js` / `messages.js` / `providerClient.js` / `imageStore.js`;
  story generation rebuilt as a LangGraph pipeline
  (`graphs/storyGraph.js`) instead of one long procedural function; a
  real test suite (`graphs/storyGraph.test.js`, Node's built-in test
  runner, mocked `fetch`, no real API calls) covering moderation
  rejection, the moderation-unavailable path, malformed-JSON retry, rate
  limiting, upstream errors, and client disconnects.

## Testing

```bash
npm test
```

Runs `graphs/storyGraph.test.js`. No API keys required, no real OpenAI or
ElevenLabs calls, `fetch` is mocked. Extend this file (or add siblings
next to it) as more of `server.js` gets pulled apart the same way the
story pipeline was.

## Separate track: React + TypeScript learning migration

Not part of this roadmap's sequencing, doesn't block anything above. A
personal learning project, ported screen by screen into a separate repo
(`~/dastaan-react`), run via the `my-react-tutor` skill
(`~/.claude/skills/my-react-tutor/`). Its own stateful progress file lives
at `~/.claude/react-tutor/progress.md`. Source app (`/Users/sogandgh/bluey`,
this repo) is read-only reference for it, never edited by that track.
