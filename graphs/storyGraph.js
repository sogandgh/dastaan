import { Annotation, END, Send, START, StateGraph } from '@langchain/langgraph';
import { languageOf } from '../languages.js';
import { checkLimit, formatRetryAfter } from '../rateLimiter.js';
import { moderateText } from '../moderation.js';
import { fetchWithTimeout, logServerError, openaiErrorMessage, OPENAI_FRIENDLY_ERROR } from '../providerClient.js';
import { newId, saveImageFile } from '../imageStore.js';
import { OPENAI_API_KEY, OPENAI_IMAGE_MODEL, OPENAI_STORY_MODEL, STORY_IMAGES_DIR } from '../env.js';
import { MODERATION_UNAVAILABLE_MESSAGE, STORY_REJECTED_MESSAGE } from '../messages.js';

const STORY_LIMIT = { max: 5, windowMs: 24 * 60 * 60 * 1000 };
const WORDS_PER_MINUTE = 130;
const MAX_WRITE_ATTEMPTS = 2;
const MAX_SCENE_IMAGE_ATTEMPTS = 2;

function buildSystemPrompt(minutes, language) {
  const lang = languageOf(language);
  const words = Math.round(minutes * WORDS_PER_MINUTE);
  const connectives = ` Write the way a parent actually talks out
  loud telling a bedtime story — natural, flowing sentences with real connective words
  (${lang.connectives}), not a string of short clipped fragments. Varying sentence
  length is fine; choppiness is not.`;
  const typingNote = lang.typingNote ? `\n- ${lang.typingNote}` : '';
  const cultureNote = `\n- Don't tie the story to ${lang.cultureNote} culture (names included) unless the request\n  asks for that — keep it global.`;
  return `You write bedtime stories in ${lang.name} for a 3-year-old.

The request may be written in English or in ${lang.name}. Either way, always write the story in ${lang.name}.

Reply with ONLY a JSON object, nothing else, no markdown fences:
{"characters": "...", "scenes": [{"text": "...", "image": "..."}, ...]}

The story is broken into scenes so a picture can be shown for each one while it plays.
Every scene is illustrated by a separate artist working alone, with no memory of the
other scenes and no picture of the story's characters — "characters" and each scene's
"image" line are the only things any of them ever sees, so those have to carry
everything needed for the character to look like the same person or animal every time:
- "characters": one line, in English, fixed for the whole story, describing every named
  character's visual appearance for an illustrator — species or age and gender, hair or
  fur colour and style, and clothing colour, e.g. "Sara: a small girl, short brown hair,
  yellow t-shirt. Mom: a woman, brown hair in a bun, green apron." Nothing about
  personality or plot, only what a repeated illustration needs to look consistent.
- "scenes": 3 to 6 of them, at natural story-beat boundaries (a scene ends when the
  setting, action, or moment changes) — never mid-sentence. Roughly equal in length.
  - "text": that scene's narration, in ${lang.name}. No title, no transliteration, no
    English, no markdown, no quotation marks. Concatenated in order, the scenes' "text"
    fields are the whole story.
  - "image": a short English description (10-20 words) of just that scene's setting and
    action — concrete and visual (who's there, where, doing what). Refer to characters
    only by the traits already given in "characters" (e.g. "the girl with brown hair"),
    since the illustrator for this scene never sees their name or any other scene.

Rules for the story itself:
- About ${words} words total across all scenes — roughly ${minutes} minute${minutes > 1 ? 's' : ''} read aloud. This length matters; stay close to it.
- Very simple ${lang.name} words a 3-year-old knows.${connectives}
- One or two main characters, named, with a small, easy-to-follow problem or adventure for them — something they actually have to work at or figure out, not something that just happens to them.
- Keep the story focused on one main idea. Every event should follow from a *reason* given earlier in the story — not from convenience. Don't introduce a new creature, object, or character partway through unless the story already gave a reason it would be there; a stray animal wandering in to make a sound is exactly the kind of random detail to avoid.
- Playful sounds, actions, and dialogue to bring it to life, woven naturally into full sentences rather than standing alone as fragments.
- Vivid but simple descriptions — concrete things a toddler has actually seen, not abstract ideas.
- Warm and gentle throughout. Never scary, sad, violent, or sarcastic. A satisfying, happy ending.
- Don't moralise, and don't let a lesson feel forced — if the story is teaching something, it should come through what happens, never through being told.${typingNote}
- Get the spelling of every word right, especially ${lang.name} names for animals, foods,
  and objects that aren't the everyday obvious ones — this gets read aloud by a
  text-to-speech voice, which pronounces exactly what's written, so a misspelled or
  invented word comes out mispronounced. Write in standard formal ${lang.name}, never a
  regional dialect or spoken-colloquial contraction, the text-to-speech voice is tuned
  for standard pronunciation and colloquial contractions come out sounding stilted or
  wrong.${cultureNote}
- The voice reading this aloud understands audio delivery tags in square brackets — [giggles], [laughs], [whispers], [excited], [curious], [mischievously], [sighs]. Place 3-6 of them across the whole story, right before the word or line they should colour, wherever a moment actually calls for it (a giggle after something silly, a whisper for a secret, excitement at a happy surprise). Always in English, in brackets, even though the story itself is in ${lang.name}, and they belong in "text", never in "image". Don't overuse them — most sentences need none.`;
}

async function requestSceneImage(sceneEn, signal, who) {
  const prompt =
    `${sceneEn}, flat vector illustration for a children's picture book, warm and ` +
    `cheerful, simple bold shapes, soft shading, gentle pastel background, no text, ` +
    `no watermark, no border, universal setting and clothing not tied to any one ` +
    `country or culture`;

  const upstream = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: '1024x1024',
      quality: 'low',
      n: 1,
    }),
  }, 45000, signal);
  if (!upstream.ok) {
    await logServerError('openai', await openaiErrorMessage(upstream), who);
    throw new Error(OPENAI_FRIENDLY_ERROR);
  }

  const data = await upstream.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    await logServerError('openai', 'Scene image generation returned no b64_json', who);
    throw new Error(OPENAI_FRIENDLY_ERROR);
  }
  return b64;
}

export const StoryState = Annotation.Root({
  userPrompt: Annotation(),
  minutes: Annotation(),
  language: Annotation(),
  userId: Annotation(),
  who: Annotation(),
  signal: Annotation(),
  attempts: Annotation({ reducer: (_a, b) => b, default: () => 0 }),
  scenes: Annotation(),
  characters: Annotation(),
  fileId: Annotation(),
  sceneIndex: Annotation(),
  sceneImagePrompt: Annotation(),
  sceneImages: Annotation({ reducer: (a, b) => a.concat(b), default: () => [] }),
  savedScenes: Annotation(),
  status: Annotation(),
  httpStatus: Annotation(),
  errorMessage: Annotation(),
});

async function moderateInput(state) {
  try {
    const moderation = await moderateText(state.userPrompt);
    if (moderation.flagged) {
      await logServerError('moderation', `Story prompt rejected (${moderation.reason}): ${state.userPrompt.slice(0, 200)}`, state.who);
      return { status: 'rejected', httpStatus: 400, errorMessage: STORY_REJECTED_MESSAGE };
    }
    return { status: 'ok' };
  } catch (e) {
    await logServerError('moderation', `Moderation check failed: ${e.message}`, state.who);
    return { status: 'moderation_unavailable', httpStatus: 503, errorMessage: MODERATION_UNAVAILABLE_MESSAGE };
  }
}

function checkRateLimitNode(state) {
  const limit = checkLimit('story', state.userId, STORY_LIMIT.max, STORY_LIMIT.windowMs);
  if (!limit.allowed) {
    return {
      status: 'rate_limited',
      httpStatus: 429,
      errorMessage: `That's today's stories used up. Try again in ${formatRetryAfter(limit.retryAfterMs)}.`,
    };
  }
  return { status: 'ok' };
}

async function writeStory(state) {
  if (state.signal?.aborted) return { status: 'aborted' };

  const upstream = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_STORY_MODEL,
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: buildSystemPrompt(state.minutes, state.language) },
        { role: 'user', content: state.userPrompt },
      ],
    }),
  }, 30000, state.signal);
  if (state.signal?.aborted) return { status: 'aborted' };

  if (!upstream.ok) {
    let detail = `OpenAI error ${upstream.status}.`;
    try {
      const body = await upstream.json();
      detail = body?.error?.message || detail;
    } catch {  }
    await logServerError('openai', detail, state.who);
    return { status: 'provider_error', httpStatus: upstream.status, errorMessage: OPENAI_FRIENDLY_ERROR };
  }

  const data = await upstream.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';
  const jsonText = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let scenes, characters;
  try {
    ({ scenes, characters } = JSON.parse(jsonText));
  } catch {
    scenes = null;
  }
  const valid = Array.isArray(scenes) && scenes.length > 0 && scenes.every(s => s?.text);
  if (!valid) {
    if (state.attempts + 1 < MAX_WRITE_ATTEMPTS) {
      return { status: 'retry_write', attempts: state.attempts + 1 };
    }
    await logServerError('openai', `Malformed scenes JSON: ${jsonText.slice(0, 500)}`, state.who);
    return { status: 'provider_error', httpStatus: 502, errorMessage: OPENAI_FRIENDLY_ERROR };
  }

  return { status: 'ok', scenes, characters, fileId: newId('story') };
}

function routeAfterWriteStory(state) {
  if (state.status === 'retry_write') return 'writeStory';
  if (state.status !== 'ok') return END;

  const prefix = state.characters ? `${state.characters}. ` : '';
  return state.scenes.map((s, i) => new Send('generateSceneImage', {
    ...state,
    sceneIndex: i,
    sceneImagePrompt: s.image ? `${prefix}${s.image}` : '',
  }));
}

async function generateSceneImage(state) {
  if (state.signal?.aborted) return { sceneImages: [] };
  if (!state.sceneImagePrompt) return { sceneImages: [{ index: state.sceneIndex, path: null }] };

  let lastErr = null;
  for (let attempt = 0; attempt < MAX_SCENE_IMAGE_ATTEMPTS; attempt++) {
    if (state.signal?.aborted) return { sceneImages: [] };
    try {
      const b64 = await requestSceneImage(state.sceneImagePrompt, state.signal, state.who);
      const path = await saveImageFile(state.userId, `${state.fileId}-${state.sceneIndex}`, `data:image/png;base64,${b64}`, STORY_IMAGES_DIR);
      return { sceneImages: [{ index: state.sceneIndex, path }] };
    } catch (e) {
      lastErr = e;
    }
  }
  if (!state.signal?.aborted) {
    await logServerError('openai', `Scene ${state.sceneIndex} image failed after ${MAX_SCENE_IMAGE_ATTEMPTS} attempts: ${lastErr?.message || lastErr}`, state.who);
  }
  return { sceneImages: [{ index: state.sceneIndex, path: null }] };
}

function finalizeStory(state) {
  if (state.signal?.aborted) return { status: 'aborted' };
  const ordered = state.sceneImages;
  const savedScenes = state.scenes.map((s, i) => ({
    text: s.text,
    image: ordered.find(o => o.index === i)?.path ?? null,
  }));
  return { status: 'ok', savedScenes };
}

const compiledStoryGraph = new StateGraph(StoryState)
  .addNode('moderateInput', moderateInput)
  .addNode('checkRateLimit', checkRateLimitNode)
  .addNode('writeStory', writeStory)
  .addNode('generateSceneImage', generateSceneImage)
  .addNode('finalizeStory', finalizeStory)
  .addEdge(START, 'moderateInput')
  .addConditionalEdges('moderateInput', s => s.status === 'ok' ? 'checkRateLimit' : END, ['checkRateLimit', END])
  .addConditionalEdges('checkRateLimit', s => s.status === 'ok' ? 'writeStory' : END, ['writeStory', END])
  .addConditionalEdges('writeStory', routeAfterWriteStory, ['writeStory', 'generateSceneImage', END])
  .addEdge('generateSceneImage', 'finalizeStory')
  .addEdge('finalizeStory', END)
  .compile();

export async function runStoryGraph({ userPrompt, minutes, language, userId, who, signal }) {
  return compiledStoryGraph.invoke({ userPrompt, minutes, language, userId, who, signal, attempts: 0 });
}
