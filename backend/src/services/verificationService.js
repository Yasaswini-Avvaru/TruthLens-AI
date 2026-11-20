import mongoose from 'mongoose';
import Verification from '../models/Verification.js';
import { analyzeEvidence, extractClaims } from './aiService.js';
import { calculateEvidenceCoverage } from './evidenceMetrics.js';
import { detectInputLanguage, resolveResponseLanguage } from './languageService.js';
import { searchEvidence } from './searchService.js';
import { analyzeScamIndicators } from './scamService.js';

export async function verifyText(originalText, requestedLanguage = 'auto', input = {}) {
  const languageDetection = input.languageDetection || await detectInputLanguage(originalText);
  const responseLanguage = resolveResponseLanguage(languageDetection, requestedLanguage);
  if (!responseLanguage.supported) {
    return { supported: false, status: 422, code: 'LANGUAGE_UNSUPPORTED', error: responseLanguage.reason, originalText, languageDetection };
  }

  const extractedClaims = await extractClaims(originalText, languageDetection.dominantLanguage.name);
  if (!extractedClaims.length) {
    return { supported: false, status: 422, code: 'NO_FACTUAL_CLAIMS', error: 'No factual claim was identified in this text. Please submit a specific factual statement.', originalText, languageDetection };
  }

  const claimResults = await Promise.all(extractedClaims.map(async (claimText) => {
    const sources = await searchEvidence(claimText);
    const analysis = await analyzeEvidence(claimText, sources, responseLanguage.language.name);
    const evidenceById = new Map(sources.map((source) => [source.id, source]));
    const supportingEvidence = analysis.supportingSourceIds.map((id) => evidenceById.get(id)).filter(Boolean);
    const contradictingEvidence = analysis.contradictingSourceIds.map((id) => evidenceById.get(id)).filter(Boolean);
    return {
      claimText,
      origins: (input.segments || []).filter((segment) => typeof segment.text === 'string' && segment.text.includes(claimText)).map(({ type, timestamp }) => ({ type, timestamp: Number.isFinite(timestamp) ? timestamp : null })),
      verdict: analysis.verdict,
      confidence: calculateEvidenceCoverage(sources, [...supportingEvidence, ...contradictingEvidence]),
      summary: analysis.summary,
      detailedExplanation: analysis.detailedExplanation,
      supportingEvidence,
      contradictingEvidence,
      sources,
      limitations: analysis.limitations,
    };
  }));

  const uniqueByUrl = (items) => [...new Map(items.map((item) => [item.url, item])).values()];
  const verdicts = [...new Set(claimResults.map((item) => item.verdict))];
  const verdict = verdicts.length === 1 ? verdicts[0] : 'Inconclusive';
  const supportingEvidence = uniqueByUrl(claimResults.flatMap((item) => item.supportingEvidence));
  const contradictingEvidence = uniqueByUrl(claimResults.flatMap((item) => item.contradictingEvidence));
  const sources = uniqueByUrl(claimResults.flatMap((item) => item.sources));
  let scamAnalysis;
  try { scamAnalysis = await analyzeScamIndicators(originalText, sources, responseLanguage.language.name); }
  catch (error) { scamAnalysis = { status: 'unavailable', reason: error.message }; }
  const result = {
    claim: originalText,
    originalText,
    inputType: input.inputType || 'text',
    inputMethod: input.inputMethod || 'text',
    verdict,
    summary: claimResults.map((item) => item.summary).join(' '),
    detailedExplanation: claimResults.length === 1 ? claimResults[0].detailedExplanation : claimResults.map((item) => `${item.claimText}\n${item.detailedExplanation}`).join('\n\n'),
    claimResults,
    confidence: Math.round(claimResults.reduce((total, item) => total + item.confidence, 0) / claimResults.length),
    supportingEvidence,
    contradictingEvidence,
    sources,
    scamAnalysis,
    language: responseLanguage.language.name,
    languageDetection,
    ...(typeof input.speechLanguageCode === 'string' ? { speechLanguageCode: input.speechLanguageCode } : {}),
    responseLanguage: { ...responseLanguage.language, mode: responseLanguage.mode, translationStatus: 'generated_in_response_language' },
    createdAt: new Date().toISOString(),
    saved: false,
    limitations: [...new Set([
      ...claimResults.flatMap((item) => item.limitations),
      'Evidence coverage is a heuristic based on cited-source coverage, distinct domains, and source-domain categories. It is not a probability that the verdict is correct.',
      'Domain categories are automated clues only; review linked sources directly.',
    ])],
    ...(input.inputType && input.inputType !== 'text' ? {
      originalFilename: input.originalFilename,
      mediaMetadata: input.mediaMetadata,
      extraction: input.extraction,
    } : {}),
  };
  return { supported: true, result };
}

export async function persistVerification(result) {
  if (mongoose.connection.readyState !== 1) {
    result.limitations.push('This report is temporary and was not saved because MongoDB is not connected.');
    return result;
  }
  try {
    const saved = await Verification.create(result);
    result.id = saved.id;
    result.saved = true;
  } catch (error) {
    console.error('Could not save verification:', error.message);
    result.limitations.push('This report could not be saved to history because database storage is unavailable.');
  }
  return result;
}
