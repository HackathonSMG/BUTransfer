import { AppError } from '../utils/errors.js';
import env from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `${req.method} ${req.path} not found` } });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    return res.status(err.status).json(body);
  }

  // multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'File too large' } });
  }

  // zod / JSON parse errors
  if (err.status === 400 || err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }

  const msg = env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error');
  if (env.NODE_ENV !== 'test') console.error('[error]', err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: msg } });
}
