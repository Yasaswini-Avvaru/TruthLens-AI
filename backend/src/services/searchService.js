import { classifySourceDomain, compareSources } from './evidenceMetrics.js';

const SEARCH_URL = 'https://api.tavily.com/search';

export async function searchEvidence(query, options = {}) {
  const apiKey = process.env.SEARCH_API_KEY;
  if (!apiKey) {
    const error = new Error('Web search is not configured. Add SEARCH_API_KEY to backend/.env.');
    error.status = 503;
    throw error;
  }

  let response;
  try {
    response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query, search_depth: 'basic', max_results: 6, include_answer: false,
        ...(Array.isArray(options.includeDomains) && options.includeDomains.length ? { include_domains: options.includeDomains } : {}),
        ...(options.country ? { country: options.country } : {}),
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const error = new Error('The web search service could not be reached. Please try again later.');
    error.status = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`The web search service returned HTTP ${response.status}.`);
    error.status = 502;
    throw error;
  }

  let data;
  try { data = await response.json(); } catch {
    const error = new Error('The web search service returned an invalid response.');
    error.status = 502;
    throw error;
  }
  if (!Array.isArray(data.results)) {
    const error = new Error('The web search service returned an invalid response.');
    error.status = 502;
    throw error;
  }

  const sources = data.results
    .filter((item) => typeof item.url === 'string' && /^https?:\/\//i.test(item.url))
    .slice(0, 6)
    .map((item) => ({
      title: String(item.title || 'Untitled source').slice(0, 300),
      url: item.url,
      snippet: String(item.content || '').slice(0, 1200),
      publishedDate: String(item.published_date || '').slice(0, 80),
      searchScore: Number.isFinite(item.score) ? Math.max(0, Math.min(1, item.score)) : null,
      ...classifySourceDomain(item.url),
    }));
  return compareSources([...new Map(sources.map((source) => [source.url, source])).values()])
    .map((source, index) => ({ id: index + 1, ...source }));
}
