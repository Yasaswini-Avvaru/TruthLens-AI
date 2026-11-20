import test from 'node:test';
import assert from 'node:assert/strict';
import { basicImageMetadata, validateImageBuffer } from './visionService.js';

test('image validation checks both declared MIME/extension and file signature', () => {
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.equal(validateImageBuffer(png, 'image/png', 'news.PNG'), true);
  assert.equal(validateImageBuffer(png, 'image/jpeg', 'news.jpg'), false);
  assert.equal(validateImageBuffer(png, 'image/png', 'news.jpg'), false);
});

test('basic metadata reports dimensions and does not infer whether an image is manipulated', () => {
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(basicImageMetadata(png, 'image/png'), {
    format: 'png', sizeBytes: 24, width: 640, height: 480, exifPresent: false,
    metadataScope: 'Basic header observations only; no manipulation conclusion.',
  });
});
