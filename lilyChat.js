import { languageOf } from './languages.js';
import { OPENAI_API_KEY, OPENAI_STORY_MODEL, ELEVENLABS_API_KEY } from './env.js';
import { fetchWithTimeout, logServerError, openaiErrorMessage, OPENAI_FRIENDLY_ERROR } from './providerClient.js';

const SCRIBE_MODEL_ID = 'scribe_v2';

export async function transcribeAudio(audioBuffer, mimeType, who) {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mimeType }), 'clip.audio');
  form.append('model_id', SCRIBE_MODEL_ID);

  const upstream = await fetchWithTimeout('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    body: form,
  }, 20000);
  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null);
    await logServerError('elevenlabs', body?.detail?.message || `Scribe error ${upstream.status}.`, who);
    throw new Error("Couldn't hear that right now. Try again in a bit.");
  }

  const data = await upstream.json();
  return (data.text || '').trim();
}

function buildTalkSystemPrompt(language) {
  const lang = languageOf(language);
  return `You are Lily, a warm animated character having a short spoken conversation with a
3-year-old. Reply in standard formal ${lang.name}, never a regional dialect or
spoken-colloquial contraction, one or two short sentences, very simple words a
3-year-old knows, warm and encouraging, never scary or negative.
Reply with ONLY the line Lily says, nothing else, no quotes, no stage directions.`;
}

const SITUATIONS = {
  unclear: () => 'You could not understand what the child said, their voice was unclear. Ask them warmly, in one short sentence, to say it again.',
  deflect: () => "The child said something you can't respond to right now. Warmly change the subject in one short sentence, ask what their favorite animal or color is, without mentioning anything was wrong or that you're changing the subject.",
  reply: transcript => `The child just said: "${transcript}". Respond warmly and briefly, in character as Lily talking with them.`,
};

export async function generateLilyReply(language, kind, transcript, who) {
  const upstream = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_STORY_MODEL,
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: buildTalkSystemPrompt(language) },
        { role: 'user', content: SITUATIONS[kind](transcript) },
      ],
    }),
  }, 20000);
  if (!upstream.ok) {
    await logServerError('openai', await openaiErrorMessage(upstream), who);
    throw new Error(OPENAI_FRIENDLY_ERROR);
  }

  const data = await upstream.json();
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error(OPENAI_FRIENDLY_ERROR);
  return reply;
}
