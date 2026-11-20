import express, { Router } from 'express';
import { askScheme, askSchemeByAudio, speakSchemeAnswer } from '../controllers/schemeController.js';

const router = Router();
const maxAudioBytes = Number(process.env.VOICE_MAX_AUDIO_BYTES) || 10 * 1024 * 1024;

router.post('/ask', askScheme);
router.post('/ask-audio', express.raw({ type: '*/*', limit: maxAudioBytes }), askSchemeByAudio);
router.post('/:answerId/speech', speakSchemeAnswer);

export default router;
