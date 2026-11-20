import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEvidenceCoverage, classifySourceDomain, compareSources } from './evidenceMetrics.js';

test('source domain labels distinguish official, research, and other domains without treating them as verdicts', () => {
  assert.deepEqual(classifySourceDomain('https://pib.gov.in/press'), { domain: 'pib.gov.in', domainType: 'official' });
  assert.equal(classifySourceDomain('https://journal.example.edu/article').domainType, 'research');
  assert.equal(classifySourceDomain('https://example.com/story').domainType, 'other');
  assert.equal(classifySourceDomain('not a url').domainType, 'other');
});

test('comparison puts official and research sources before other search results', () => {
  const ordered = compareSources([{ domainType: 'other' }, { domainType: 'research' }, { domainType: 'official' }]);
  assert.deepEqual(ordered.map(({ domainType }) => domainType), ['official', 'research', 'other']);
});

test('evidence coverage accounts for cited coverage, distinct domains, and source categories', () => {
  const sources = [
    { url: 'https://a.gov.in', domain: 'a.gov.in', domainType: 'official' },
    { url: 'https://b.edu', domain: 'b.edu', domainType: 'research' },
    { url: 'https://c.example', domain: 'c.example', domainType: 'other' },
  ];
  assert.equal(calculateEvidenceCoverage(sources, [sources[0], sources[1]]), 75);
  assert.equal(calculateEvidenceCoverage(sources, []), 0);
  assert.equal(calculateEvidenceCoverage([], []), 0);
});
