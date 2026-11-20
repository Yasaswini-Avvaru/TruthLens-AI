import test from 'node:test';
import assert from 'node:assert/strict';
import { detectInputLanguage, resolveResponseLanguage } from './languageService.js';

const examples = [
  ['This is a claim in English.', { tag: 'en', name: 'English' }, ['en']],
  ['Tamil language sample', { tag: 'ta', name: 'Tamil' }, ['ta']],
  ['Kannada language sample', { tag: 'kn', name: 'Kannada' }, ['kn']],
  ['ఇది తెలుగు వాక్యం.', { tag: 'te', name: 'Telugu' }, ['te']],
  ['यह हिंदी वाक्य है।', { tag: 'hi', name: 'Hindi' }, ['hi']],
  ['Ceci est une affirmation en français.', { tag: 'fr', name: 'French' }, ['fr']],
  ['ఈ claim తెలుగు और English में है।', { tag: 'te', name: 'Telugu' }, ['te', 'en']],
];

test('detects configured and mixed input languages without changing original text', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = 'test-only';

  try {
    for (const [text, dominantLanguage, detectedTags] of examples) {
      globalThis.fetch = async (_url, options) => {
        const payload = JSON.parse(options.body);
        assert.equal(JSON.parse(payload.messages[1].content).text, text);
        const detectedLanguages = detectedTags.map((tag) => ({
          tag,
          name: tag === 'en' ? 'English' : tag === 'te' ? 'Telugu' : tag === 'hi' ? 'Hindi' : 'French',
          confidence: 0.95,
        }));
        return Response.json({ choices: [{ message: { content: JSON.stringify({ status: 'detected', dominantLanguage, detectedLanguages, limitations: [] }) } }] });
      };

      const result = await detectInputLanguage(text);
      assert.equal(result.dominantLanguage.tag, dominantLanguage.tag);
      assert.deepEqual(result.detectedLanguages.map(({ tag }) => tag), detectedTags);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
  }
});

test('uses detected dominant language by default and allows configured manual response language', () => {
  const oldInput = process.env.MODEL_INPUT_LANGUAGES;
  const oldOutput = process.env.MODEL_RESPONSE_LANGUAGES;
  process.env.MODEL_INPUT_LANGUAGES = 'en:English,te:Telugu,hi:Hindi,ta:Tamil,kn:Kannada,fr:French';
  process.env.MODEL_RESPONSE_LANGUAGES = 'en:English,te:Telugu,hi:Hindi,ta:Tamil,kn:Kannada,fr:French';
  try {
    const detection = { dominantLanguage: { tag: 'te-IN', name: 'Telugu' } };
    assert.deepEqual(resolveResponseLanguage(detection, 'auto'), {
      supported: true,
      language: { tag: 'te', name: 'Telugu' },
      mode: 'auto',
    });
    assert.equal(resolveResponseLanguage(detection, 'en').language.name, 'English');
    assert.equal(resolveResponseLanguage(detection, 'auto').language.name, 'Telugu');
    assert.equal(resolveResponseLanguage({ dominantLanguage: { tag: 'fr', name: 'French' } }, 'auto').supported, true);
    assert.equal(resolveResponseLanguage({ dominantLanguage: { tag: 'ta', name: 'Tamil' } }, 'auto').language.tag, 'ta');
    assert.equal(resolveResponseLanguage({ dominantLanguage: { tag: 'kn', name: 'Kannada' } }, 'auto').language.tag, 'kn');
  } finally {
    if (oldInput === undefined) delete process.env.MODEL_INPUT_LANGUAGES;
    else process.env.MODEL_INPUT_LANGUAGES = oldInput;
    if (oldOutput === undefined) delete process.env.MODEL_RESPONSE_LANGUAGES;
    else process.env.MODEL_RESPONSE_LANGUAGES = oldOutput;
  }
});

test('reports unsupported input rather than silently defaulting to English', () => {
  const result = resolveResponseLanguage({ dominantLanguage: { tag: 'ja', name: 'Japanese' } }, 'auto');
  assert.equal(result.supported, false);
  assert.match(result.reason, /Japanese/);
});

test('explains language-provider rate limits without exposing provider response details', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = 'test-only';
  globalThis.fetch = async () => new Response('provider details must not leak', {
    status: 429,
    headers: { 'retry-after': '30' },
  });
  try {
    await assert.rejects(detectInputLanguage('A claim in English'), (error) => {
      assert.equal(error.status, 429);
      assert.match(error.message, /rate-limiting requests/);
      assert.match(error.message, /usage and quota/);
      assert.match(error.message, /30 seconds/);
      assert.doesNotMatch(error.message, /provider details must not leak/);
      return true;
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
  }
});
