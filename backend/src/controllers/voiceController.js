import mongoose from 'mongoose';
import Verification from '../models/Verification.js';
import VoiceConversation from '../models/VoiceConversation.js';
import { detectInputLanguage, resolveResponseLanguage } from '../services/languageService.js';
import { answerFromVerification, resolveSarvamTtsLanguage, resolveVoiceLanguage, SARVAM_AUDIO_MIME_TYPES, synthesizeSpeech, transcribeAudio, voiceCapabilities } from '../services/voiceService.js';

export function getVoiceCapabilities(req, res) {
  return res.json({ success: true, ...voiceCapabilities() });
}

export async function createConversation(req, res, next) {
  try {
    const verification = await findVerification(req.params.verificationId);
    if (!verification) return res.status(404).json({ success: false, error: 'Saved verification was not found. Voice conversations require a saved report.' });
    const capabilities = voiceCapabilities();
    const requested = req.body?.responseLanguage;
    const language = requested && requested !== 'auto'
      ? { tag: requested, name: requested }
      : (verification.speechLanguageCode || verification.responseLanguage?.tag
        ? { tag: verification.speechLanguageCode || verification.responseLanguage.tag, name: verification.speechLanguageCode ? (resolveSarvamTtsLanguage(verification.speechLanguageCode)?.name || verification.speechLanguageCode) : (verification.responseLanguage.name || verification.language) }
        : { tag: 'und', name: verification.language || 'unknown' });
    const conversation = await VoiceConversation.create({
      verification: verification._id,
      inputLanguage: verification.languageDetection?.dominantLanguage,
      responseLanguage: { ...language, mode: requested && requested !== 'auto' ? 'manual' : 'auto' },
    });
    const outputSupported = resolveVoiceLanguage(language.tag, capabilities.outputLanguages);
    return res.status(201).json({ success: true, conversation: { id: conversation.id, status: conversation.status, responseLanguage: conversation.responseLanguage }, speechAvailable: Boolean(capabilities.textToSpeech && outputSupported), speechUnavailableReason: !capabilities.textToSpeech ? 'Speech generation is not configured.' : (!outputSupported ? `Speech generation is not configured for ${language.name}.` : null) });
  } catch (error) { return next(error); }
}

export async function createTextTurn(req, res, next) {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 5000) return res.status(400).json({ success: false, error: 'Enter a follow-up question of 1 to 5,000 characters.' });
    return await processTurn(req, res, text, null, next);
  } catch (error) { return next(error); }
}

export async function createAudioTurn(req, res, next) {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ success: false, error: 'Upload a short audio recording.' });
    const maxBytes = voiceCapabilities().maxAudioBytes;
    if (req.body.length > maxBytes) return res.status(413).json({ success: false, error: `Audio must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.` });
    const mimeType = (req.get('content-type') || '').split(';')[0].toLowerCase();
    if (!SARVAM_AUDIO_MIME_TYPES.includes(mimeType)) return res.status(415).json({ success: false, error: 'Use a supported audio format such as WebM, Ogg, WAV, MP3, or M4A.' });
    const transcript = await transcribeAudio(req.body, mimeType);
    return await processTurn(req, res, transcript.text, { detection: transcript.languageDetection, model: transcript.model }, next);
  } catch (error) { return next(error); }
}

async function processTurn(req, res, text, audioMetadata, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.conversationId)) return res.status(404).json({ success: false, error: 'Conversation was not found.' });
    const conversation = await VoiceConversation.findById(req.params.conversationId);
    if (!conversation || conversation.status !== 'active') return res.status(404).json({ success: false, error: 'Active conversation was not found.' });
    if (conversation.turns.length >= 40) return res.status(429).json({ success: false, error: 'This conversation reached its turn limit. Start a new voice session.' });
    const verification = await Verification.findById(conversation.verification);
    if (!verification) return res.status(404).json({ success: false, error: 'The verification linked to this conversation is unavailable.' });

    const detection = audioMetadata?.detection || await detectInputLanguage(text);
    const manualVoiceLanguage = conversation.responseLanguage?.mode === 'manual';
    const selectedLanguage = manualVoiceLanguage
      ? { supported: true, language: { tag: conversation.responseLanguage.tag, name: conversation.responseLanguage.name } }
      : resolveResponseLanguage(detection, 'auto');
    if (!selectedLanguage.supported) {
      return res.status(422).json({ success: false, code: 'VOICE_RESPONSE_LANGUAGE_UNSUPPORTED', error: `${selectedLanguage.reason} Choose a supported report language to continue.`, transcript: text, detectedLanguage: detection.dominantLanguage });
    }
    const language = selectedLanguage.language.name;
    const history = conversation.turns.map(({ role, text: turnText }) => ({ role, content: turnText }));
    const answer = await answerFromVerification(verification, text, language, history);
    conversation.turns.push({ role: 'user', text, language: detection.dominantLanguage });
    conversation.turns.push({ role: 'assistant', text: answer, language: selectedLanguage.language });
    conversation.inputLanguage = detection.dominantLanguage;
    if (!manualVoiceLanguage) conversation.responseLanguage = { ...selectedLanguage.language, mode: 'auto' };
    await conversation.save();
    const assistantTurn = conversation.turns[conversation.turns.length - 1];
    return res.json({ success: true, turn: { userText: text, detectedLanguage: detection.dominantLanguage, assistantText: answer, assistantTurnId: assistantTurn.id, responseLanguage: conversation.responseLanguage }, conversationId: conversation.id, speechAvailable: Boolean(voiceCapabilities().configured && resolveVoiceLanguage(conversation.responseLanguage?.tag, voiceCapabilities().outputLanguages)) });
  } catch (error) { return next(error); }
}

export async function speakVerification(req, res, next) {
  try {
    const verification = await findVerification(req.params.verificationId);
    if (!verification) return res.status(404).json({ success: false, error: 'Saved verification was not found.' });
    const language = requestedLanguage(req.body?.responseLanguage, verification);
    const capability = resolveVoiceLanguage(language.tag, voiceCapabilities().outputLanguages);
    if (!capability) return res.status(422).json({ success: false, code: 'VOICE_LANGUAGE_UNSUPPORTED', error: `Speech generation is not configured for ${language.name}. The written report is still available.` });
    const script = [
      `Verdict: ${verification.verdict}.`,
      `Evidence coverage: ${verification.confidence} percent.`,
      verification.summary,
      verification.detailedExplanation,
      (verification.verdict === 'Unverified' || verification.verdict === 'Inconclusive') ? 'This result is not conclusive. Do not treat it as confirmed.' : '',
    ].filter(Boolean).join('\n');
    const audio = await synthesizeSpeech(script, capability.tag);
    res.set({ 'Content-Type': audio.contentType, 'Cache-Control': 'no-store', 'X-Voice-Model': audio.model, 'X-Speech-Language': audio.languageCode, 'X-Speech-Speaker': audio.speaker });
    return res.send(audio.buffer);
  } catch (error) { return next(error); }
}

export async function speakTurn(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.conversationId) || !mongoose.isValidObjectId(req.params.turnId)) return res.status(404).json({ success: false, error: 'Conversation turn was not found.' });
    const conversation = await VoiceConversation.findById(req.params.conversationId);
    const turn = conversation?.turns.id(req.params.turnId);
    if (!turn || turn.role !== 'assistant') return res.status(404).json({ success: false, error: 'Assistant response was not found.' });
    const capability = resolveVoiceLanguage(turn.language?.tag, voiceCapabilities().outputLanguages);
    if (!capability) return res.status(422).json({ success: false, code: 'VOICE_LANGUAGE_UNSUPPORTED', error: `Speech generation is not configured for ${turn.language?.name || 'this language'}.` });
    const audio = await synthesizeSpeech(turn.text, capability.tag);
    res.set({ 'Content-Type': audio.contentType, 'Cache-Control': 'no-store', 'X-Voice-Model': audio.model, 'X-Speech-Language': audio.languageCode, 'X-Speech-Speaker': audio.speaker });
    return res.send(audio.buffer);
  } catch (error) { return next(error); }
}

export async function endConversation(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.conversationId)) return res.status(404).json({ success: false, error: 'Conversation was not found.' });
    const conversation = await VoiceConversation.findByIdAndUpdate(req.params.conversationId, { status: 'ended' }, { new: true });
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation was not found.' });
    return res.json({ success: true, status: conversation.status });
  } catch (error) { return next(error); }
}

export async function getConversation(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.conversationId)) return res.status(404).json({ success: false, error: 'Conversation was not found.' });
    const conversation = await VoiceConversation.findById(req.params.conversationId).select('-__v');
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation was not found.' });
    return res.json({ success: true, conversation });
  } catch (error) { return next(error); }
}

async function findVerification(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Verification.findById(id);
}
function requestedLanguage(requested, verification) {
  const useDetectedSpeechLanguage = (!requested || requested === 'auto') && verification.speechLanguageCode;
  const tag = useDetectedSpeechLanguage
    ? verification.speechLanguageCode
    : (typeof requested === 'string' && requested.trim() && requested !== 'auto' ? requested : verification.responseLanguage?.tag || '');
  const supported = resolveVoiceLanguage(tag, voiceCapabilities().outputLanguages);
  return supported || { tag: String(tag).toLowerCase(), name: useDetectedSpeechLanguage
    ? (resolveSarvamTtsLanguage(tag)?.name || tag)
    : (verification.responseLanguage?.name || verification.language || tag || 'detected language') };
}
