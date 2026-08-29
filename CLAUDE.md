# Dastaan

A Persian/Swedish kids' app: flashcards, bedtime stories, a talk-to-Lily tab,
and a picture-matching game. React 19 + TypeScript client (Vite), a small
Node.js (`node:http`) backend, Supabase for accounts and data, OpenAI for
text/image generation, ElevenLabs for text-to-speech and speech-to-text.

Two conventions that apply to every file in this repo, client and server:
no code comments, and no em dashes anywhere (chat, code, commit messages,
user-facing strings, docs).

## Adding a new language

`languages.js` (and its type file `languages.d.ts`) is the single source of
truth for per-language content. Every place in the app that needs to know
about a language reads from `LANGUAGES`/`languageOf()`, nothing is
hardcoded to `fa`/`sv` anywhere in the client or the server. Adding a
language should be a pure data change, no logic changes, if any step below
turns out to need a code change instead, that's a bug in the language
abstraction worth fixing rather than working around.

1. **Add the entry to `languages.js`.** Every field is required unless
   noted:
   - `code`: the language code (ISO 639-1 where one exists), used as the
     object key too.
   - `name`: English name, used in prompts sent to OpenAI.
   - `native`: the language's own name, in its own script, shown in the UI
     (language picker, settings).
   - `dir`: `'ltr'` or `'rtl'`.
   - `font`: a CSS `font-family` value. Add the actual font (Google Fonts
     link or a bundled file) if the existing fonts don't cover the script.
   - `connectives`: a handful of natural connective words in the language
     (and, because, then, until, ...), used in the story prompt to steer
     away from short clipped sentences.
   - `typingNote`: optional. Any script-specific typing/rendering gotcha
     worth telling the model about (Farsi's needs a note about the
     zero-width non-joiner). Empty string if none.
   - `cultureNote`: how to refer to the culture/country in English inside a
     prompt (e.g. `'Sweden or Swedish'`), used so stories don't default to
     that culture unless asked.
   - `celebrationLine`: one short, warm "good job!" phrase, said by Lily
     after a correct answer in the game.
   - `tryAgainLine`: one short, warm "try again!" phrase, said after a
     wrong answer in the game.
   - Both `celebrationLine` and `tryAgainLine` must be standard formal
     written language, never a regional dialect or spoken-colloquial
     contraction (Farsi example of what to avoid: `دیگه` instead of the
     correct formal `دیگر`), and for Farsi specifically, no Arabic-script
     vowel-pointing marks (اعراب) at all, plain undotted vowels only. These
     two lines are spoken by the server's audio cache the first time
     they're needed and reused forever after, so get them right once
     rather than regenerating.
2. **Update `languages.d.ts`** to match if you added, renamed, or removed
   any field.
3. **Generate `celebrationLine`/`tryAgainLine` with a real OpenAI call**,
   don't hand-write them. Ask for a short warm phrase with the meaning
   spelled out in plain English, explicitly requiring standard formal
   written language and (for Farsi) Persian letterforms and script rather
   than Arabic ones. Read the actual Unicode codepoints of what comes back
   before trusting it, this codebase has twice shipped Farsi text with the
   wrong letterforms (Arabic ي/ك instead of Persian ی/ک) or a stray
   Arabic-only diacritic mark that looked fine on screen but was wrong.
4. **No other code changes should be needed.** The story prompt
   (`graphs/storyGraph.js`), the card-translate/image prompt (`server.js`'s
   `buildTranslatePrompt`), and the Talk tab reply prompt (`lilyChat.js`)
   are all built purely from `languageOf(language)`. The client's language
   picker (`src/pages/ChooseLanguagePage.tsx`), the Settings language
   dropdown (`src/components/SettingsModal.tsx`), and every other UI
   surface iterate `LANGUAGES`/call `languageOf()` generically.
5. **Verify against the real APIs before shipping, not just by reading the
   prompt.** At minimum:
   - Generate a story and a few flashcards in the new language, read the
     actual text back (not just that the call succeeded).
   - Play the generated audio through ElevenLabs (`eleven_v3` is
     multilingual, but confirm it actually pronounces this language
     acceptably, don't assume).
   - To catch accidental hardcoding to the existing two languages, run any
     throwaway verification script against a fake language that isn't in
     the real `LANGUAGES` registry (a fake `de`/German entry has worked
     well for this in the past) and confirm the generic code path handles
     it correctly.
6. **Update `README.md`/`ROADMAP.md`** if either mentions the language list
   by name.

## Testing

```bash
npm test
```

Runs `node --test` against `graphs/**/*.test.js` (backend, no real API
calls, `fetch` is mocked), then `vitest run` against the client. See
`README.md` for the full breakdown of what each suite covers.
