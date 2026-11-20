import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeScamIndicators } from './scamService.js';

const previousKey = process.env.LLM_API_KEY;
const previousUrl = process.env.LLM_API_URL;
const previousModel = process.env.LLM_MODEL;
const previousFetch = globalThis.fetch;

test('scam indicators require exact evidence from the message or retrieved sources', async () => {
  process.env.LLM_API_KEY = 'test-only';
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    riskLevel: 'high',
    indicators: [
      { category: 'payment_request', description: 'Requests money.', evidenceText: 'Pay a fee now', sourceIds: [1, 999] },
      { category: 'phishing_url', description: 'Fabricated evidence.', evidenceText: 'fake evidence', sourceIds: [1] },
    ],
    recommendedPrecautions: ['Check with the official organization.'],
  }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const result = await analyzeScamIndicators('Pay a fee now to apply.', [{ title: 'Page', url: 'https://example.gov.in', snippet: '', domainType: 'official' }], 'English');
    assert.equal(result.status, 'complete');
    assert.equal(result.riskLevel, 'high');
    assert.equal(result.indicators.length, 1);
    assert.deepEqual(result.indicators[0].sources.map((source) => source.url), ['https://example.gov.in']);
  } finally { restoreEnvironment(); }
});

test('unsupported model quotations cannot create a warning indicator', async () => {
  process.env.LLM_API_KEY = 'test-only';
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    riskLevel: 'high', indicators: [{ category: 'other', description: 'Claimed concern', evidenceText: 'not in the message', sourceIds: [] }], recommendedPrecautions: [],
  }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const result = await analyzeScamIndicators('This is ordinary text.', [], 'English');
    assert.equal(result.riskLevel, 'inconclusive');
    assert.deepEqual(result.indicators, []);
  } finally { restoreEnvironment(); }
});

function restoreEnvironment() {
  globalThis.fetch = previousFetch;
  if (previousKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previousKey;
  if (previousUrl === undefined) delete process.env.LLM_API_URL; else process.env.LLM_API_URL = previousUrl;
  if (previousModel === undefined) delete process.env.LLM_MODEL; else process.env.LLM_MODEL = previousModel;
}
