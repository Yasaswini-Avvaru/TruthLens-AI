const windows = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export function verificationRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const entry = windows.get(key);
  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (entry.count >= MAX_REQUESTS) {
    return res.status(429).json({ success: false, error: 'Too many verification requests. Please wait a minute and try again.' });
  }
  entry.count += 1;
  return next();
}
