const OFFICIAL_HOSTS = ['nic.in', 'gov.in', 'gov.uk', 'europa.eu', 'who.int', 'un.org'];
const RESEARCH_HOSTS = ['pubmed.ncbi.nlm.nih.gov', 'nature.com', 'science.org', 'sciencedirect.com', 'springer.com', 'edu', 'ac.uk', 'edu.in', 'edu.au'];

export function classifySourceDomain(url) {
  let hostname = '';
  try { hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return { domain: '', domainType: 'other' }; }
  const matches = (domain) => hostname === domain || hostname.endsWith(`.${domain}`);
  const isGovernment = /\.gov(?:\.[a-z]{2})?$/.test(hostname) || OFFICIAL_HOSTS.some(matches);
  const isResearch = RESEARCH_HOSTS.some((domain) => domain === 'edu' ? hostname.endsWith('.edu') : matches(domain));
  return { domain: hostname, domainType: isGovernment ? 'official' : isResearch ? 'research' : 'other' };
}

export function compareSources(sources) {
  return [...sources].sort((a, b) => sourceRank(a.domainType) - sourceRank(b.domainType)
    || (Number(b.searchScore) || 0) - (Number(a.searchScore) || 0));
}

export function calculateEvidenceCoverage(sources, citedSources) {
  const sourceUrls = new Set(sources.map((source) => source.url));
  const cited = [...new Map(citedSources.filter((source) => sourceUrls.has(source.url)).map((source) => [source.url, source])).values()];
  if (!sources.length || !cited.length) return 0;
  const retrievalCoverage = cited.length / sources.length;
  const independentDomains = new Set(cited.map((source) => source.domain || classifySourceDomain(source.url).domain)).size;
  const domainDiversity = Math.min(independentDomains / 3, 1);
  const primaryCoverage = cited.filter((source) => ['official', 'research'].includes(source.domainType)).length / cited.length;
  return Math.round((retrievalCoverage * 0.5 + domainDiversity * 0.25 + primaryCoverage * 0.25) * 100);
}

function sourceRank(domainType) { return ({ official: 0, research: 1, other: 2 })[domainType] ?? 2; }
