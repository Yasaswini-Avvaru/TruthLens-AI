import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEvidence, extractClaims } from './aiService.js';

function withModelResponse(payload) {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = 'test-only';
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify(payload(request)) } }] });
  };
  return () => {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
  };
}

test('claim extraction preserves verbatim claims, removes invalid paraphrases and caps results at five', async () => {
  const text = 'Claim one. Claim two. Claim three. Claim four. Claim five. Claim six.';
  const restore = withModelResponse(() => ({ claims: ['Claim one.', 'Paraphrased claim.', 'Claim one.', 'Claim two.', 'Claim three.', 'Claim four.', 'Claim five.', 'Claim six.'] }));
  try {
    assert.deepEqual(await extractClaims(text, 'English'), ['Claim one.', 'Claim two.', 'Claim three.', 'Claim four.', 'Claim five.']);
  } finally { restore(); }
});

test('claim extraction rejects incomplete provider output', async () => {
  const restore = withModelResponse(() => ({ items: [] }));
  try { await assert.rejects(extractClaims('A factual statement.'), /incomplete response/); }
  finally { restore(); }
});

test('unsupported source IDs cannot support a verdict', async () => {
  const restore = withModelResponse(() => ({ verdict: 'Supported', summary: 'Summary.', detailedExplanation: 'Explanation.', supportingSourceIds: [99], contradictingSourceIds: [], limitations: [] }));
  try {
    const result = await analyzeEvidence('A claim.', [{ id: 1, url: 'https://example.gov', title: 'Source', snippet: 'Text' }]);
    assert.equal(result.verdict, 'Inconclusive');
    assert.equal(result.supportingSourceIds.length, 0);
    assert.match(result.limitations[0], /did not identify a source supporting/);
  } finally { restore(); }
});

test('no retrieved evidence cannot produce a supported verdict', async () => {
  let observedSources;
  const restore = withModelResponse((request) => {
    observedSources = JSON.parse(request.messages[1].content).sources;
    return { verdict: 'Supported', summary: 'No evidence.', detailedExplanation: 'No sources were retrieved.', supportingSourceIds: [1], contradictingSourceIds: [], limitations: [] };
  });
  try {
    const result = await analyzeEvidence('A claim.', []);
    assert.deepEqual(observedSources, []);
    assert.equal(result.verdict, 'Inconclusive');
    assert.deepEqual(result.supportingSourceIds, []);
  } finally { restore(); }
});
