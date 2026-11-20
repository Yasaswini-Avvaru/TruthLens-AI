import test from 'node:test';
import assert from 'node:assert/strict';
import { isIndianOfficialDomain } from './schemeService.js';

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
