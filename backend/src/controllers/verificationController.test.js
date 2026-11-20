import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeClaim } from './verificationController.js';

test('analyzeClaim verifies extracted claims independently and returns a conservative aggregate', async () => {
  const names = ['LLM_API_KEY', 'LLM_API_URL', 'LLM_MODEL', 'SEARCH_API_KEY', 'MODEL_INPUT_LANGUAGES', 'MODEL_RESPONSE_LANGUAGES'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, {
    LLM_API_KEY: 'test-only', LLM_API_URL: 'https://model.test/chat', LLM_MODEL: 'test-model', SEARCH_API_KEY: 'test-only',
    MODEL_INPUT_LANGUAGES: 'en:English', MODEL_RESPONSE_LANGUAGES: 'en:English',
  });

  globalThis.fetch = async (url, options) => {
    if (url === 'https://api.tavily.com/search') {
      const { query } = JSON.parse(options.body);
      const slug = query.includes('10 clinics') ? 'ten' : 'twelve';
      return Response.json({ results: [
        { title: 'Official record', url: `https://${slug}.gov.in/record`, content: 'Official count is 10 clinics.', score: 0.9 },
        { title: 'Independent report', url: `https://${slug}.example.org/report`, content: 'Reported count is 10 clinics.', score: 0.8 },
      ] });
    }
    const { messages } = JSON.parse(options.body);
    const system = messages[0].content;
    if (system.includes('Identify the language')) {
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        status: 'detected', dominantLanguage: { tag: 'en', name: 'English' },
        detectedLanguages: [{ tag: 'en', name: 'English', confidence: 0.99 }], limitations: [],
      }) } }] });
    }
    const submitted = JSON.parse(messages[1].content);
    if (system.includes('Screen the supplied message')) {
      return Response.json({ choices: [{ message: { content: JSON.stringify({ riskLevel: 'no_clear_indicators', indicators: [], recommendedPrecautions: [] }) } }] });
    }
    if (system.includes('Extract factual assertions')) {
      return Response.json({ choices: [{ message: { content: JSON.stringify({ claims: ['The city has 10 clinics.', 'The city has 12 clinics.'] }) } }] });
    }
    const supportsClaim = submitted.claim.includes('10 clinics');
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      verdict: supportsClaim ? 'Supported' : 'Contradicted',
      summary: supportsClaim ? 'The official record supports this count.' : 'The official record does not support this count.',
      detailedExplanation: supportsClaim ? 'The cited official record lists the stated count.' : 'The cited official record conflicts with the stated count.',
      supportingSourceIds: supportsClaim ? [1] : [], contradictingSourceIds: supportsClaim ? [] : [1], limitations: [],
    }) } }] });
  };

  try {
    let status = 200;
    let responseBody;
    const res = { status(code) { status = code; return this; }, json(body) { responseBody = body; return this; } };
    await analyzeClaim({ body: { text: 'The city has 10 clinics. The city has 12 clinics.', responseLanguage: 'auto' } }, res, (error) => { throw error; });

    assert.equal(status, 200);
    assert.equal(responseBody.success, true);
    assert.deepEqual(responseBody.result.claimResults.map(({ claimText, verdict }) => ({ claimText, verdict })), [
      { claimText: 'The city has 10 clinics.', verdict: 'Supported' },
      { claimText: 'The city has 12 clinics.', verdict: 'Contradicted' },
    ]);
    assert.equal(responseBody.result.verdict, 'Inconclusive');
    assert.equal(responseBody.result.claimResults[0].supportingEvidence[0].domainType, 'official');
    assert.equal(responseBody.result.claimResults[1].contradictingEvidence[0].url, 'https://twelve.gov.in/record');
  } finally {
    globalThis.fetch = previousFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
