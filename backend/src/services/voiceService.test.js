import test from 'node:test';
import assert from 'node:assert/strict';
import { SARVAM_AUDIO_MIME_TYPES, resolveSarvamTtsLanguage, synthesizeSpeech, transcribeAudio, voiceCapabilities } from './voiceService.js';

const ENV_KEYS = ['VOICE_API_KEY', 'SARVAM_API_BASE_URL', 'SARVAM_STT_MODEL', 'SARVAM_STT_MODE', 'VOICE_TTS_API_KEY', 'LLM_API_KEY', 'VOICE_MAX_RECORDING_SECONDS'];
const previousEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const previousFetch = globalThis.fetch;

test('Saaras v4 request uses secure key header, automatic language detection and transcription mode', async () => {
  process.env.VOICE_API_KEY = 'sarvam-test-key';
  process.env.SARVAM_STT_MODEL = 'saaras:v4';
  process.env.SARVAM_STT_MODE = 'codemix';
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ transcript: 'ఇది test message', language_code: 'te-IN', language_probability: 0.97, request_id: 'request-test' }), { status: 200 });
  };
  try {
    const result = await transcribeAudio(Buffer.from('fake audio bytes'), 'audio/webm;codecs=opus');
    assert.equal(request.url, 'https://api.sarvam.ai/speech-to-text');
    assert.equal(request.options.headers['api-subscription-key'], 'sarvam-test-key');
    assert.equal(request.options.headers.Authorization, undefined);
    assert.equal(request.options.body.get('model'), 'saaras:v4');
    assert.equal(request.options.body.get('mode'), 'transcribe');
    assert.equal(request.options.body.get('language_code'), 'unknown');
    assert.equal(result.text, 'ఇది test message');
    assert.deepEqual(result.languageDetection.dominantLanguage, { tag: 'te-in', name: 'Telugu' });
    assert.equal(result.languageDetection.detectedLanguages[0].confidence, 0.97);
  } finally { restore(); }
});

test('empty and unsupported audio are rejected before making an API request', async () => {
  process.env.VOICE_API_KEY = 'sarvam-test-key';
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error('Unexpected network call'); };
  try {
    await assert.rejects(transcribeAudio(Buffer.alloc(0), 'audio/webm'), { code: 'EMPTY_AUDIO' });
    await assert.rejects(transcribeAudio(Buffer.from('data'), 'audio/unsupported'), { code: 'UNSUPPORTED_AUDIO_FORMAT' });
    assert.equal(requests, 0);
    assert.ok(SARVAM_AUDIO_MIME_TYPES.includes('audio/webm'));
  } finally { restore(); }
});

test('Saaras preserves automatic detection results for English, Telugu, Hindi, Tamil, and Kannada', async () => {
  process.env.VOICE_API_KEY = 'sarvam-test-key';
  const cases = [
    ['en-IN', 'English'], ['te-IN', 'Telugu'], ['hi-IN', 'Hindi'], ['ta-IN', 'Tamil'], ['kn-IN', 'Kannada'],
  ];
  let current = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({
    transcript: `sample ${cases[current][1]}`, language_code: cases[current][0], language_probability: 0.91,
  }), { status: 200 });
  try {
    for (const [tag, name] of cases) {
      const result = await transcribeAudio(Buffer.from('audio'), 'audio/webm');
      assert.equal(result.languageDetection.dominantLanguage.tag, tag.toLowerCase());
      assert.equal(result.languageDetection.dominantLanguage.name, name);
      assert.equal(result.languageDetection.detectedLanguages[0].confidence, 0.91);
      current += 1;
    }
  } finally { restore(); }
});

test('Sarvam authentication failures return a safe message without provider payload details', async () => {
  process.env.VOICE_API_KEY = 'sarvam-test-key';
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'sensitive provider detail' } }), { status: 403 });
  try {
    await assert.rejects(transcribeAudio(Buffer.from('audio'), 'audio/wav'), (error) => {
      assert.equal(error.code, 'SARVAM_AUTH_FAILED');
      assert.match(error.message, /VOICE_API_KEY/);
      assert.doesNotMatch(error.message, /sensitive provider detail/);
      return true;
    });
  } finally { restore(); }
});

test('one Sarvam key enables STT and TTS and recording is capped at 30 seconds', () => {
  process.env.VOICE_API_KEY = 'sarvam-test-key';
  delete process.env.VOICE_TTS_API_KEY;
  delete process.env.LLM_API_KEY;
  process.env.VOICE_MAX_RECORDING_SECONDS = '60';
  try {
    const capabilities = voiceCapabilities();
    assert.equal(capabilities.speechToText, true);
    assert.equal(capabilities.textToSpeech, true);
    assert.equal(capabilities.provider, 'sarvam-ai');
    assert.equal(capabilities.maxRecordingSeconds, 30);
    assert.ok(capabilities.inputLanguages.some(({ tag }) => tag === 'te-in'));
    assert.ok(capabilities.inputLanguages.some(({ tag }) => tag === 'kn-in'));
    for (const tag of ['en-in', 'te-in', 'hi-in', 'ta-in', 'kn-in']) assert.ok(capabilities.outputLanguages.some((item) => item.tag === tag));
  } finally { restore(); }
});

test('Bulbul v4 Flash uses canonical language codes, configured personas, secure key, and returns audio', async () => {
  process.env.VOICE_API_KEY = 'sarvam-test-key';
  const expected = { 'en-IN': 'shubh_en_recovery', 'te-IN': 'kavitha_te_conversation', 'hi-IN': 'aparna_hi_customer', 'ta-IN': 'gokul_ta_narration', 'kn-IN': 'chaitra_kn_conversation' };
  for (const [language, speaker] of Object.entries(expected)) {
    process.env.VOICE_API_KEY = 'sarvam-test-key';
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ audios: [Buffer.from('test mp3').toString('base64')] }), { status: 200 });
    };
    try {
      const result = await synthesizeSpeech('Simple explanation', language);
      const body = JSON.parse(request.options.body);
      assert.equal(request.url, 'https://api.sarvam.ai/text-to-speech');
      assert.equal(request.options.headers['api-subscription-key'], 'sarvam-test-key');
      assert.equal(body.model, 'bulbul:v4-flash');
      assert.equal(body.language_code, language);
      assert.equal(body.speaker, speaker);
      assert.equal(result.languageCode, language);
      assert.equal(result.buffer.toString(), 'test mp3');
    } finally { restore(); }
  }
});

test('unsupported TTS languages are rejected before a provider request', async () => {
  process.env.VOICE_API_KEY = 'sarvam-test-key';
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error('Unexpected network call'); };
  try {
    assert.equal(resolveSarvamTtsLanguage('ml-IN'), null);
    await assert.rejects(synthesizeSpeech('Explanation', 'ml-IN'), { code: 'TTS_LANGUAGE_UNSUPPORTED' });
    assert.equal(requests, 0);
  } finally { restore(); }
});

test('Bulbul API failures are reported safely and preserve text fallback', async () => {
  process.env.VOICE_API_KEY = 'sarvam-test-key';
  globalThis.fetch = async () => new Response('{}', { status: 429 });
  try {
    await assert.rejects(synthesizeSpeech('Explanation', 'te-IN'), (error) => error.code === 'SARVAM_RATE_LIMITED' && /written explanation is still available/.test(error.message));
  } finally { restore(); }
});

function restore() {
  globalThis.fetch = previousFetch;
  for (const key of ENV_KEYS) {
    if (previousEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnvironment[key];
  }
}
