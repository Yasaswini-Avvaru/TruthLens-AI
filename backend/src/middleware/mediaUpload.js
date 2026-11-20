import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { promisify } from 'node:util';

const IMAGE_MAX_BYTES = Number(process.env.IMAGE_MAX_BYTES) || 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = Number(process.env.VIDEO_MAX_BYTES) || 100 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] };
const VIDEO_TYPES = { 'video/mp4': '.mp4', 'video/webm': '.webm' };

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES, files: 1, fields: 1, parts: 2, fieldNameSize: 50, fieldSize: 30 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_TYPES[file.mimetype]?.includes(extension)) return callback(uploadError('Upload a JPG, JPEG, PNG, or WEBP image.', 415));
    callback(null, true);
  },
}).single('file');

const parseVideoUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      fs.mkdtemp(path.join(os.tmpdir(), 'truthlens-video-'), (error, directory) => {
        if (error) return callback(error);
        req.mediaTempDirectory = directory;
        callback(null, directory);
      });
    },
    filename(req, file, callback) {
      callback(null, `${crypto.randomUUID()}${VIDEO_TYPES[file.mimetype] || '.bin'}`);
    },
  }),
  limits: { fileSize: VIDEO_MAX_BYTES, files: 1, fields: 1, parts: 2, fieldNameSize: 50, fieldSize: 30 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (VIDEO_TYPES[file.mimetype] !== extension) return callback(uploadError('Upload an MP4 or WEBM video.', 415));
    callback(null, true);
  },
}).single('file');

export function videoUpload(req, res, next) {
  parseVideoUpload(req, res, async (error) => {
    if (error) {
      if (req.mediaTempDirectory) await removeTempDirectory(req.mediaTempDirectory);
      return next(error);
    }
    return next();
  });
}

export async function removeTempDirectory(directory) {
  const resolved = path.resolve(directory);
  const tempRoot = path.resolve(os.tmpdir());
  if (!path.basename(resolved).startsWith('truthlens-video-') || path.dirname(resolved) !== tempRoot) return;
  await promisify(fs.rm)(resolved, { recursive: true, force: true });
}

function uploadError(message, status) { const error = new Error(message); error.status = status; return error; }
