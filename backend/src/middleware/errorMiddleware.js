export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(error, req, res, next) {
  console.error(error);
  if (res.headersSent) return next(error);
  const errorCode = typeof error.code === 'string' ? error.code : '';
  const uploadErrors = {
    LIMIT_FILE_SIZE: 'Uploaded file exceeds the configured size limit.',
    LIMIT_FILE_COUNT: 'Upload one file at a time.',
    LIMIT_UNEXPECTED_FILE: 'Use the file field to upload one media file.',
    LIMIT_PART_COUNT: 'Upload contains too many form fields.',
  };
  const hasExplicitStatus = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599;
  const status = hasExplicitStatus
    ? error.status
    : errorCode === 'LIMIT_FILE_SIZE' ? 413 : errorCode.startsWith('LIMIT_') ? 400 : 500;
  const message = errorCode.startsWith('LIMIT_')
    ? (uploadErrors[errorCode] || error.message || 'The request could not be processed.')
    : (hasExplicitStatus && typeof error.message === 'string'
      ? error.message
      : status < 500 && typeof error.message === 'string' ? error.message : 'An unexpected server error occurred.');
  res.status(status).json({
    success: false,
    error: message,
  });
}
