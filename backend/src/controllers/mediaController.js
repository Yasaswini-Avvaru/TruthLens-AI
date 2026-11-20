import fs from 'node:fs/promises';
import path from 'node:path';
import { persistVerification, verifyText } from '../services/verificationService.js';
import { basicImageMetadata, extractImageText, validateImageBuffer } from '../services/visionService.js';
import { transcribeVideoAudio } from '../services/voiceService.js';
import { extractVideoAssets, inspectVideo } from '../services/videoProcessingService.js';
import { removeTempDirectory } from '../middleware/mediaUpload.js';

export async function analyzeImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose an image file to upload.' });
    if (!validateImageBuffer(req.file.buffer, req.file.mimetype, req.file.originalname)) {
      return res.status(415).json({ success: false, error: 'The image content does not match its JPG, PNG, or WEBP file type.' });
    }
    const metadata = basicImageMetadata(req.file.buffer, req.file.mimetype);
    if (metadata.width && metadata.height && (metadata.width > 20000 || metadata.height > 20000 || metadata.width * metadata.height > 100_000_000)) {
      return res.status(413).json({ success: false, error: 'Image dimensions exceed the supported processing limit.' });
    }
    const [ocr] = await extractImageText([{ buffer: req.file.buffer, mimeType: req.file.mimetype }]);
    const extractedText = ocr.text;
    const extraction = {
      ocr: { status: extractedText ? 'complete' : 'no_text_found', provider: 'configured multimodal model', model: process.env.IMAGE_OCR_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini', originalText: extractedText },
      forensics: { status: 'unavailable', reason: 'No image-forensics or AI-image detection model is configured.' },
    };
    if (!extractedText) return res.status(422).json({ success: false, code: 'OCR_NO_TEXT', error: 'No readable text was found in this image. No claim verification was generated.', extractedText, extraction, mediaMetadata: metadata });
    if (extractedText.length > 10000) return res.status(413).json({ success: false, code: 'EXTRACTED_TEXT_TOO_LONG', error: 'The image contains more than 10,000 readable characters. No text was truncated or verified.', extractedText, extraction, mediaMetadata: metadata });

    const analysis = await verifyText(extractedText, req.body?.responseLanguage ?? 'auto', {
      inputType: 'image', originalFilename: safeFilename(req.file.originalname), mediaMetadata: metadata, extraction,
      segments: [{ type: 'image_ocr', text: extractedText }],
    });
    if (!analysis.supported) return res.status(analysis.status).json({ success: false, code: analysis.code, error: analysis.error, originalText: extractedText, extractedText, languageDetection: analysis.languageDetection, extraction, mediaMetadata: metadata });
    analysis.result.limitations.push('Image manipulation and AI-generation analysis is unavailable because no forensic model is configured.');
    const result = await persistVerification(analysis.result);
    return res.json({ success: true, result });
  } catch (error) { return next(error); }
}

export async function analyzeVideo(req, res, next) {
  const directory = req.mediaTempDirectory;
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose an MP4 or WEBM video to upload.' });
    const fileHandle = await fs.open(req.file.path, 'r');
    const header = Buffer.alloc(16);
    await fileHandle.read(header, 0, header.length, 0);
    await fileHandle.close();
    const isMp4 = req.file.mimetype === 'video/mp4' && header.toString('ascii', 4, 8) === 'ftyp';
    const isWebm = req.file.mimetype === 'video/webm' && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!isMp4 && !isWebm) return res.status(415).json({ success: false, error: 'Video content does not match its MP4 or WEBM file type.' });

    const mediaMetadata = await inspectVideo(req.file.path);
    const assets = await extractVideoAssets(req.file.path, directory, mediaMetadata);
    let transcript = '';
    let transcriptionStatus = mediaMetadata.hasAudio ? 'unavailable' : 'no_audio_track';
    let transcriptionError = assets.audioError || '';
    if (assets.audio?.length) {
      try {
        const transcribed = await transcribeVideoAudio(assets.audio, 'audio/wav');
        transcript = transcribed.text;
        transcriptionStatus = 'complete';
      } catch (error) { transcriptionError = error.message; }
    }

    let frames = [];
    let ocrError = '';
    try { frames = await extractImageText(assets.frames); }
    catch (error) { ocrError = error.message; }
    const originalFrameText = frames.map((frame) => frame.text).filter(Boolean);
    const inputSegments = [
      ...(transcript ? [{ type: 'transcript', timestamp: null, text: transcript }] : []),
      ...frames.filter((frame) => frame.text).map((frame) => ({ type: 'frame_ocr', timestamp: frame.timestamp, text: frame.text })),
    ];
    const originalText = inputSegments.map((segment) => segment.text).join('\n\n');
    const extraction = {
      transcription: { status: transcriptionStatus, provider: transcript ? (process.env.VOICE_PROVIDER || 'configured speech provider') : null, originalText: transcript, error: transcriptionError || undefined },
      frameOcr: { status: frames.length ? (ocrError ? 'unavailable' : originalFrameText.length ? 'complete' : 'no_text_found') : 'unavailable', provider: frames.length && !ocrError ? 'configured multimodal model' : null, model: process.env.IMAGE_OCR_MODEL || process.env.LLM_MODEL || null, frames: frames.map(({ timestamp, text }) => ({ timestamp, originalText: text })), error: ocrError || undefined },
      forensics: { status: 'unavailable', reason: 'No video/audio forensics model is configured.' },
    };
    if (!originalText.trim()) {
      return res.status(422).json({ success: false, code: 'VIDEO_NO_EXTRACTED_TEXT', error: 'No speech transcript or readable on-screen text was available. No claim verification was generated.', extraction, mediaMetadata });
    }
    if (originalText.length > 10000) return res.status(413).json({ success: false, code: 'EXTRACTED_TEXT_TOO_LONG', error: 'Extracted video text exceeds 10,000 characters. No text was truncated or verified.', extractedText: originalText, extraction, mediaMetadata });

    const analysis = await verifyText(originalText, req.body?.responseLanguage ?? 'auto', {
      inputType: 'video', originalFilename: safeFilename(req.file.originalname), mediaMetadata, extraction, segments: inputSegments,
    });
    if (!analysis.supported) return res.status(analysis.status).json({ success: false, code: analysis.code, error: analysis.error, originalText, extractedText: originalText, languageDetection: analysis.languageDetection, extraction, mediaMetadata });
    analysis.result.limitations.push('Visual/audio manipulation analysis is unavailable because no forensic model is configured.');
    if (transcriptionStatus !== 'complete') analysis.result.limitations.push(transcriptionError || 'No usable audio transcript was available.');
    if (ocrError) analysis.result.limitations.push(`On-screen text extraction failed: ${ocrError}`);
    const result = await persistVerification(analysis.result);
    return res.json({ success: true, result });
  } catch (error) { return next(error); }
  finally { if (directory) await removeTempDirectory(directory); }
}

function safeFilename(filename) {
  return path.basename(filename || 'uploaded-media').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 150) || 'uploaded-media';
}
