import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from './errorMiddleware.js';

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('error handler returns JSON for errors with numeric provider codes', () => {
  const response = responseRecorder();
  const previousError = console.error;
  console.error = () => {};
  try {
    errorHandler(Object.assign(new Error('internal provider detail'), { code: 429 }), {}, response, () => {});
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { success: false, error: 'An unexpected server error occurred.' });
  } finally { console.error = previousError; }
});

test('error handler preserves expected client error messages and statuses', () => {
  const response = responseRecorder();
  const previousError = console.error;
  console.error = () => {};
  try {
    errorHandler(Object.assign(new Error('Invalid request'), { status: 400 }), {}, response, () => {});
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { success: false, error: 'Invalid request' });
  } finally { console.error = previousError; }
});

test('error handler exposes intentional sanitized provider errors with 5xx status', () => {
  const response = responseRecorder();
  const previousError = console.error;
  console.error = () => {};
  try {
    errorHandler(Object.assign(new Error('The language detection service returned HTTP 404.'), { status: 502 }), {}, response, () => {});
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.body, { success: false, error: 'The language detection service returned HTTP 404.' });
  } finally { console.error = previousError; }
});
