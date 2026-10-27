import { randomUUID } from 'node:crypto';
import env from '../config/env.js';

export function requestContext(req, res, next) {
  req.requestId = randomUUID();
  res.setHeader('x-request-id', req.requestId);
  if (env.LOG_REQUESTS) {
    const t0 = Date.now();
    res.on('finish', () => {
      console.log(`[${req.requestId}] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - t0}ms)`);
    });
  }
  next();
}
