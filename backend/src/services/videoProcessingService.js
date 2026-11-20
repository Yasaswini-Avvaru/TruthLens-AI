import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function inspectVideo(filePath) {
  const { stdout } = await runTool(process.env.FFPROBE_PATH || 'ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', filePath,
  ], 15000);
  let probe;
  try { probe = JSON.parse(stdout); } catch { throw serviceError('This video could not be inspected. It may be malformed or use an unsupported codec.', 415); }
  const duration = Number(probe.format?.duration);
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  if (!Number.isFinite(duration) || duration <= 0 || !videoStream) throw serviceError('This file does not contain a readable video stream.', 415);
  const maxSeconds = Number(process.env.VIDEO_MAX_DURATION_SECONDS) || 120;
  if (duration > maxSeconds) throw serviceError(`Video duration must be ${maxSeconds} seconds or shorter.`, 413);
  return {
    durationSeconds: Math.round(duration * 100) / 100,
    width: Number.isFinite(videoStream.width) ? videoStream.width : null,
    height: Number.isFinite(videoStream.height) ? videoStream.height : null,
    videoCodec: videoStream.codec_name || 'unknown',
    audioCodec: streams.find((stream) => stream.codec_type === 'audio')?.codec_name || null,
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    maxFrames: Number(process.env.VIDEO_MAX_FRAMES) || 12,
  };
}

export async function extractVideoAssets(filePath, directory, metadata) {
  const frameCount = Math.min(metadata.maxFrames, Math.max(1, Math.floor(metadata.durationSeconds / 10)));
  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const timestamp = Math.round((metadata.durationSeconds * (index + 1) / (frameCount + 1)) * 100) / 100;
    const framePath = path.join(directory, `frame-${String(index).padStart(2, '0')}.jpg`);
    await runTool(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-nostdin', '-v', 'error', '-y', '-ss', String(timestamp), '-i', filePath,
      '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=1024:-2', '-q:v', '5', framePath,
    ], 30000);
    const buffer = await fs.readFile(framePath);
    if (!buffer.length) throw serviceError(`Could not extract the representative video frame at ${timestamp} seconds.`, 502);
    frames.push({ timestamp, buffer, mimeType: 'image/jpeg' });
  }

  let audio = null;
  let audioError = '';
  if (metadata.hasAudio) {
    const audioPath = path.join(directory, 'audio.wav');
    try {
      await runTool(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-nostdin', '-v', 'error', '-y', '-i', filePath, '-map', '0:a:0', '-vn',
        '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-t', String(metadata.durationSeconds), audioPath,
      ], 60000);
      audio = await fs.readFile(audioPath);
    } catch (error) { audioError = error.message; }
  }
  return { frames, audio, audioError };
}

async function runTool(command, args, timeout) {
  try {
    return await execFileAsync(command, args, { timeout, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  } catch (error) {
    if (error.code === 'ENOENT') throw serviceError(`${path.basename(command)} is not installed or is not on PATH.`, 503);
    if (error.killed || error.code === 'ETIMEDOUT') throw serviceError(`${path.basename(command)} processing timed out.`, 504);
    throw serviceError(`${path.basename(command)} could not process this media file.`, 415);
  }
}

function serviceError(message, status) { const error = new Error(message); error.status = status; return error; }
