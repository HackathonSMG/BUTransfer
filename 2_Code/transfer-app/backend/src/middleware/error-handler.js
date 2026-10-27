import { AppError } from '../utils/errors.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    console.error('[ERROR]', { message: err.message, code: err.code, statusCode: err.statusCode, url: req.url, method: req.method });
  } else if (!err.statusCode || err.statusCode >= 500) {
    console.error('[ERROR]', err.message, err.stack);
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: `File too large. Maximum allowed size is ${process.env.UPLOAD_MAX_MB || 10} MB.` } });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: { code: 'UNEXPECTED_FILE', message: 'Unexpected file field in upload.' } });
  }

  // AppError
  if (err instanceof AppError) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;
    if (isDev) body.error.stack = err.stack;
    return res.status(err.statusCode).json(body);
  }

  // PostgreSQL unique violation
  if (err.code === '23505') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with that value already exists.' } });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: { code: 'REFERENCE_ERROR', message: 'A referenced record does not exist.' } });
  }

  // Generic
  const statusCode = err.status || err.statusCode || 500;
  const message = statusCode < 500 ? err.message : 'An unexpected error occurred. Please try again later.';
  const body = { error: { code: 'INTERNAL_ERROR', message } };
  if (isDev) { body.error.originalMessage = err.message; body.error.stack = err.stack; }
  return res.status(statusCode).json(body);
}

export default errorHandler;
