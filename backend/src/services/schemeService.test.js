import test from 'node:test';
import assert from 'node:assert/strict';
import { answerSchemeQuestion, isIndianOfficialDomain } from './schemeService.js';

test('official government and NIC hostnames are allowlisted safely', () => {
  for (const hostname of ['gov.in', 'www.gov.in', 'myscheme.gov.in', 'india.gov.in', 'pib.gov.in', 'data.gov.in', 'services.nic.in']) {
    assert.equal(isIndianOfficialDomain(hostname), true, hostname);
  }
});

test('lookalike or unrelated hostnames are not treated as official', () => {
  for (const hostname of ['gov.in.example.com', 'fakegov.in', 'government.example', 'notnic.in.evil.test']) {
    assert.equal(isIndianOfficialDomain(hostname), false, hostname);
  }
});

test('scheme lookup sends the country code in Tavily’s expected lowercase form and cites only official sources', async () => {
  const envKeys = ['LLM_API_KEY', 'SEARCH_API_KEY', 'LLM_API_URL', 'LLM_MODEL', 'MODEL_INPUT_LANGUAGES', 'MODEL_RESPONSE_LANGUAGES'];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  process.env.LLM_API_KEY = 'test-only';
  process.env.SEARCH_API_KEY = 'test-only';
  process.env.LLM_API_URL = 'https://llm.test/v1/chat/completions';
  process.env.LLM_MODEL = 'test-model';
  process.env.MODEL_INPUT_LANGUAGES = 'en:English';
  process.env.MODEL_RESPONSE_LANGUAGES = 'en:English';
  let modelCalls = 0;
  let searchBody;
  globalThis.fetch = async (url, options) => {
    if (url === 'https://api.tavily.com/search') {
      searchBody = JSON.parse(options.body);
      return Response.json({ results: [{
        title: 'Official scholarship portal', url: 'https://scholarships.gov.in/program',
        content: 'The official portal lists scholarship information.', published_date: '', score: 0.9,
      }] });
    }
    if (url === 'https://llm.test/v1/chat/completions') {
      modelCalls += 1;
      const content = modelCalls === 1
        ? { status: 'detected', dominantLanguage: { tag: 'en', name: 'English' }, detectedLanguages: [{ tag: 'en', name: 'English', confidence: 0.99 }], limitations: [] }
        : { schemeName: 'Scholarship information', answer: 'Check the official scholarship portal for current opportunities.', sourceIds: [1], limitations: [] };
      return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
    }
    throw new Error('Unexpected provider request');
  };
  try {
    const result = await answerSchemeQuestion('List scholarships for Indian college students');
    assert.equal(searchBody.country, 'india');
    assert.deepEqual(searchBody.include_domains, ['gov.in', 'nic.in', 'india.gov.in', 'myscheme.gov.in', 'pib.gov.in', 'data.gov.in']);
    assert.equal(result.supported, true);
    assert.equal(result.result.sources.length, 1);
    assert.equal(result.result.sources[0].url, 'https://scholarships.gov.in/program');
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});
