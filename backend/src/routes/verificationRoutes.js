import { Router } from 'express';
import { analyzeClaim, transcribeSpokenClaim } from '../controllers/verificationController.js';
import { analyzeImage, analyzeVideo } from '../controllers/mediaController.js';
import { imageUpload, videoUpload } from '../middleware/mediaUpload.js';
import express from 'express';
import { analyzeSpokenClaim } from '../controllers/verificationController.js';

const router = Router();
router.post('/analyze', analyzeClaim);
const audioBody = express.raw({ type: '*/*', limit: Number(process.env.VOICE_MAX_AUDIO_BYTES) || 10 * 1024 * 1024 });
router.post('/transcribe-audio', audioBody, transcribeSpokenClaim);
router.post('/analyze-audio', audioBody, analyzeSpokenClaim);
router.post('/image', imageUpload, analyzeImage);
router.post('/video', videoUpload, analyzeVideo);

export default router;
