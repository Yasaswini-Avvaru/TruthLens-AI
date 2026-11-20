import { persistVerification, verifyText } from '../services/verificationService.js';
import { normalizeSarvamLanguageDetection, SARVAM_AUDIO_MIME_TYPES, transcribeAudio } from '../services/voiceService.js';

export async function analyzeClaim(req, res, next) {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : typeof req.body?.claim === 'string' ? req.body.claim.trim() : '';
    if (!text) return res.status(400).json({ success: false, error: 'Enter a claim to verify.' });
    if (text.length > 10000) return res.status(400).json({ success: false, error: 'Submitted text must be 10,000 characters or fewer.' });
    const speechLanguageDetection = normalizeSarvamLanguageDetection(req.body?.speechLanguageDetection);
    const analysis = await verifyText(text, req.body?.responseLanguage ?? req.body?.language ?? 'auto', speechLanguageDetection ? {
      inputMethod: 'voice', languageDetection: speechLanguageDetection, speechLanguageCode: speechLanguageDetection.dominantLanguage.tag,
    } : {});
    if (!analysis.supported) return res.status(analysis.status).json({ success: false, code: analysis.code, error: analysis.error, originalText: analysis.originalText, languageDetection: analysis.languageDetection });
    const result = await persistVerification(analysis.result);
    return res.json({ success: true, result });
  } catch (error) { return next(error); }
}

export async function analyzeSpokenClaim(req, res, next) {
  try {
    const transcription = await transcribeRequest(req, res);
    if (!transcription) return;
    const analysis = await verifyText(transcription.text, req.query.responseLanguage || 'auto', {
      inputMethod: 'voice', languageDetection: transcription.languageDetection,
      speechLanguageCode: transcription.languageDetection.dominantLanguage?.tag,
    });
    if (!analysis.supported) return res.status(analysis.status).json({ success: false, code: analysis.code, error: analysis.error, transcript: transcription.text, speechLanguageDetection: transcription.languageDetection, languageDetection: analysis.languageDetection });
    const result = await persistVerification(analysis.result);
    return res.json({ success: true, transcript: transcription.text, speechLanguageDetection: transcription.languageDetection, result });
  } catch (error) { return next(error); }
}

export async function transcribeSpokenClaim(req, res, next) {
  try {
    const transcription = await transcribeRequest(req, res);
    if (!transcription) return;
    return res.json({ success: true, transcript: transcription.text, detectedLanguage: transcription.languageDetection });
  } catch (error) { return next(error); }
}

async function transcribeRequest(req, res) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    res.status(400).json({ success: false, code: 'EMPTY_AUDIO', error: 'The recording is empty. Please record speech first.' });
    return null;
  }
  const maxBytes = Number(process.env.VOICE_MAX_AUDIO_BYTES) || 10 * 1024 * 1024;
  if (req.body.length > maxBytes) {
    res.status(413).json({ success: false, code: 'AUDIO_TOO_LARGE', error: `Audio must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.` });
    return null;
  }
  const mimeType = (req.get('content-type') || '').split(';')[0].toLowerCase();
  if (!SARVAM_AUDIO_MIME_TYPES.includes(mimeType)) {
    res.status(415).json({ success: false, code: 'UNSUPPORTED_AUDIO_FORMAT', error: 'Use a supported format such as WebM, Ogg, WAV, MP3, M4A, AAC, or FLAC.' });
    return null;
  }
  return transcribeAudio(req.body, mimeType);
}
