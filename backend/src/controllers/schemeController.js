import mongoose from 'mongoose';
import SchemeAnswer from '../models/SchemeAnswer.js';
import { answerSchemeQuestion, isIndianOfficialDomain } from '../services/schemeService.js';
import { SARVAM_AUDIO_MIME_TYPES, synthesizeSpeech, transcribeAudio, voiceCapabilities, resolveVoiceLanguage } from '../services/voiceService.js';

export async function askScheme(req, res, next) {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question || question.length > 5000) return res.status(400).json({ success: false, error: 'Enter a question of 1 to 5,000 characters.' });
    return await answerQuestion(question, req.body?.responseLanguage || 'auto', res, next);
  } catch (error) { return next(error); }
}

export async function askSchemeByAudio(req, res, next) {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ success: false, error: 'Record a short question first.' });
    const maxBytes = Number(process.env.VOICE_MAX_AUDIO_BYTES) || 10 * 1024 * 1024;
    if (req.body.length > maxBytes) return res.status(413).json({ success: false, error: `Audio must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.` });
    const mimeType = (req.get('content-type') || '').split(';')[0].toLowerCase();
    if (!SARVAM_AUDIO_MIME_TYPES.includes(mimeType)) return res.status(415).json({ success: false, error: 'Use a supported audio format such as WebM, Ogg, WAV, MP3, or M4A.' });
    const transcription = await transcribeAudio(req.body, mimeType);
    const languageDetection = transcription.languageDetection;
    return await answerQuestion(transcription.text, req.query.responseLanguage || 'auto', res, next, languageDetection);
  } catch (error) { return next(error); }
}

async function answerQuestion(question, responseLanguage, res, next, existingDetection) {
  try {
    const answer = await answerSchemeQuestion(question, responseLanguage, existingDetection);
    if (!answer.supported) return res.status(answer.status).json({ success: false, code: 'LANGUAGE_UNSUPPORTED', error: answer.error, languageDetection: answer.languageDetection });
    const result = answer.result;
    if (existingDetection) result.languageDetection = existingDetection;
    let saved = false;
    let id = null;
    if (mongoose.connection.readyState === 1) {
      try {
        const record = await SchemeAnswer.create(result);
        id = record.id;
        saved = true;
      } catch (error) { console.error('Could not save scheme answer:', error.message); }
    }
    result.saved = saved;
    if (id) result.id = id;
    if (!saved) result.limitations.push('This answer is temporary because database storage is unavailable.');
    return res.json({ success: true, result, transcript: existingDetection ? question : undefined, speechAvailable: Boolean(id && voiceCapabilities().textToSpeech && resolveVoiceLanguage(result.responseLanguage.tag, voiceCapabilities().outputLanguages)) });
  } catch (error) { return next(error); }
}

export async function speakSchemeAnswer(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.answerId)) return res.status(404).json({ success: false, error: 'Scheme answer was not found.' });
    const answer = await SchemeAnswer.findById(req.params.answerId);
    if (!answer) return res.status(404).json({ success: false, error: 'Scheme answer was not found.' });
    const language = resolveVoiceLanguage(answer.responseLanguage?.tag, voiceCapabilities().outputLanguages);
    if (!language) return res.status(422).json({ success: false, code: 'VOICE_LANGUAGE_UNSUPPORTED', error: `Speech output is not configured for ${answer.responseLanguage?.name || 'this language'}.` });
    const script = [answer.answer, answer.eligibility && `Eligibility: ${answer.eligibility}`, answer.benefits && `Benefits: ${answer.benefits}`, answer.requiredDocuments && `Documents: ${answer.requiredDocuments}`, answer.applicationSteps && `Application steps: ${answer.applicationSteps}`, answer.deadlines && `Deadlines: ${answer.deadlines}`, answer.riskNotes, 'Check the linked official sources for current information.'].filter(Boolean).join('\n');
    const audio = await synthesizeSpeech(script, language.tag);
    res.set({ 'Content-Type': audio.contentType, 'Cache-Control': 'no-store', 'X-Voice-Model': audio.model, 'X-Speech-Language': audio.languageCode, 'X-Speech-Speaker': audio.speaker });
    return res.send(audio.buffer);
  } catch (error) { return next(error); }
}
