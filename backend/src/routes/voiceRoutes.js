import express, { Router } from 'express';
import {
  createAudioTurn, createConversation, createTextTurn, endConversation,
  getConversation, getVoiceCapabilities, speakTurn, speakVerification,
} from '../controllers/voiceController.js';

const router = Router();
const maxAudioBytes = Number(process.env.VOICE_MAX_AUDIO_BYTES) || 10 * 1024 * 1024;

router.get('/capabilities', getVoiceCapabilities);
router.post('/verification/:verificationId/speech', speakVerification);
router.post('/verification/:verificationId/conversations', createConversation);
router.get('/conversations/:conversationId', getConversation);
router.post('/conversations/:conversationId/turns', createTextTurn);
router.post('/conversations/:conversationId/audio-turns', express.raw({
  type: '*/*',
  limit: maxAudioBytes,
}), createAudioTurn);
router.post('/conversations/:conversationId/turns/:turnId/speech', speakTurn);
router.delete('/conversations/:conversationId', endConversation);

export default router;
