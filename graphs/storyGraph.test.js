import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { STORY_IMAGES_DIR } from '../env.js';
import { runStoryGraph } from './storyGraph.js';

const originalFetch = globalThis.fetch;
let testUserCounter = 0;

function nextUserId() {
  testUserCounter += 1;
  return `storygraph-test-${process.pid}-${testUserCounter}`;
}

function mockFetch(handlers) {
  globalThis.fetch = async (url, options) => {
    const href = String(url);
    for (const [match, respond] of handlers) {
      if (href.includes(match)) return respond(options);
    }
    throw new Error(`Unexpected fetch to ${href}`);
  };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function safeModerationResponse() {
  return jsonResponse(200, { results: [{ flagged: false, categories: {} }] });
}

function unsafeModerationResponse(categories) {
  const flags = Object.fromEntries(categories.map(c => [c, true]));
  return jsonResponse(200, { results: [{ flagged: true, categories: flags }] });
}

function validScenesBody() {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          characters: 'Lily: a small girl, brown hair, yellow shirt.',
          scenes: [
            { text: 'Scene one text.', image: 'the girl in a garden' },
            { text: 'Scene two text.', image: '' },
          ],
        }),
      },
    }],
  };
}

after(() => {
  globalThis.fetch = originalFetch;
});

test('rejects a flagged prompt without writing a story', async () => {
  let storyWritten = false;
  mockFetch([
    ['/v1/moderations', () => unsafeModerationResponse(['violence'])],
    ['/v1/chat/completions', () => { storyWritten = true; return jsonResponse(200, validScenesBody()); }],
  ]);

  const result = await runStoryGraph({
    userPrompt: 'anything',
    minutes: 1,
    language: 'fa',
    userId: nextUserId(),
    who: 'test@example.com',
    signal: new AbortController().signal,
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.httpStatus, 400);
  assert.equal(storyWritten, false);
});

test('reports moderation as unavailable when the check throws', async () => {
  mockFetch([
    ['/v1/moderations', () => { throw new Error('connection refused'); }],
  ]);

  const result = await runStoryGraph({
    userPrompt: 'anything',
    minutes: 1,
    language: 'fa',
    userId: nextUserId(),
    who: 'test@example.com',
    signal: new AbortController().signal,
  });

  assert.equal(result.status, 'moderation_unavailable');
  assert.equal(result.httpStatus, 503);
});

test('writes a story and saves each scene image, skipping scenes with no image prompt', async () => {
  mockFetch([
    ['/v1/moderations', safeModerationResponse],
    ['/v1/chat/completions', () => jsonResponse(200, validScenesBody())],
    ['/v1/images/generations', () => jsonResponse(200, { data: [{ b64_json: Buffer.from('fake-png').toString('base64') }] })],
  ]);

  const userId = nextUserId();
  const result = await runStoryGraph({
    userPrompt: 'a story about sharing',
    minutes: 1,
    language: 'fa',
    userId,
    who: 'test@example.com',
    signal: new AbortController().signal,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.characters, 'Lily: a small girl, brown hair, yellow shirt.');
  assert.equal(result.savedScenes.length, 2);
  assert.equal(result.savedScenes[0].text, 'Scene one text.');
  assert.match(result.savedScenes[0].image, new RegExp(`^/data/story-images/${userId}/`));
  assert.equal(result.savedScenes[1].image, null);

  await rm(join(STORY_IMAGES_DIR, userId), { recursive: true, force: true });
});

test('retries once on malformed story JSON, then succeeds', async () => {
  let chatCalls = 0;
  mockFetch([
    ['/v1/moderations', safeModerationResponse],
    ['/v1/chat/completions', () => {
      chatCalls += 1;
      if (chatCalls === 1) return jsonResponse(200, { choices: [{ message: { content: 'not json' } }] });
      return jsonResponse(200, validScenesBody());
    }],
    ['/v1/images/generations', () => jsonResponse(200, { data: [{ b64_json: Buffer.from('fake-png').toString('base64') }] })],
  ]);

  const userId = nextUserId();
  const result = await runStoryGraph({
    userPrompt: 'a story about sharing',
    minutes: 1,
    language: 'fa',
    userId,
    who: 'test@example.com',
    signal: new AbortController().signal,
  });

  assert.equal(chatCalls, 2);
  assert.equal(result.status, 'ok');

  await rm(join(STORY_IMAGES_DIR, userId), { recursive: true, force: true });
});

test('gives up after two malformed story JSON attempts', async () => {
  let chatCalls = 0;
  mockFetch([
    ['/v1/moderations', safeModerationResponse],
    ['/v1/chat/completions', () => {
      chatCalls += 1;
      return jsonResponse(200, { choices: [{ message: { content: 'still not json' } }] });
    }],
  ]);

  const result = await runStoryGraph({
    userPrompt: 'a story about sharing',
    minutes: 1,
    language: 'fa',
    userId: nextUserId(),
    who: 'test@example.com',
    signal: new AbortController().signal,
  });

  assert.equal(chatCalls, 2);
  assert.equal(result.status, 'provider_error');
  assert.equal(result.httpStatus, 502);
});

test('passes through the upstream status when OpenAI rejects the request', async () => {
  mockFetch([
    ['/v1/moderations', safeModerationResponse],
    ['/v1/chat/completions', () => jsonResponse(401, { error: { message: 'bad key' } })],
  ]);

  const result = await runStoryGraph({
    userPrompt: 'a story about sharing',
    minutes: 1,
    language: 'fa',
    userId: nextUserId(),
    who: 'test@example.com',
    signal: new AbortController().signal,
  });

  assert.equal(result.status, 'provider_error');
  assert.equal(result.httpStatus, 401);
});

test('stops at the rate limit without writing a story', async () => {
  const userId = nextUserId();
  let chatCalls = 0;
  mockFetch([
    ['/v1/moderations', safeModerationResponse],
    ['/v1/chat/completions', () => { chatCalls += 1; return jsonResponse(200, validScenesBody()); }],
    ['/v1/images/generations', () => jsonResponse(200, { data: [{ b64_json: Buffer.from('fake-png').toString('base64') }] })],
  ]);

  for (let i = 0; i < 5; i++) {
    const result = await runStoryGraph({
      userPrompt: `story number ${i}`,
      minutes: 1,
      language: 'fa',
      userId,
      who: 'test@example.com',
      signal: new AbortController().signal,
    });
    assert.equal(result.status, 'ok');
  }

  const sixth = await runStoryGraph({
    userPrompt: 'one too many',
    minutes: 1,
    language: 'fa',
    userId,
    who: 'test@example.com',
    signal: new AbortController().signal,
  });

  assert.equal(sixth.status, 'rate_limited');
  assert.equal(sixth.httpStatus, 429);
  assert.equal(chatCalls, 5);

  await rm(join(STORY_IMAGES_DIR, userId), { recursive: true, force: true });
});

test('stops cleanly when the client disconnects before the story is written', async () => {
  let chatCalls = 0;
  mockFetch([
    ['/v1/moderations', safeModerationResponse],
    ['/v1/chat/completions', () => { chatCalls += 1; return jsonResponse(200, validScenesBody()); }],
  ]);

  const controller = new AbortController();
  controller.abort();

  const result = await runStoryGraph({
    userPrompt: 'a story about sharing',
    minutes: 1,
    language: 'fa',
    userId: nextUserId(),
    who: 'test@example.com',
    signal: controller.signal,
  });

  assert.equal(result.status, 'aborted');
  assert.equal(chatCalls, 0);
});
