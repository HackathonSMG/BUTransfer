/**
 * Express application: security headers, CORS, JSON parsing, the REST API under /api and
 * (optionally) the static frontend. Business logic lives in services/, data access in repositories/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import env from './config/env.js';
import routes from './routes/index.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  }));
  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.use('/api', cors({ origin: (o, cb) => cb(null, !o || origins.includes(o)), credentials: false }));
  app.use(requestContext);
  app.use(express.json({ limit: '200kb' }));
  app.use('/api', routes);
  app.use('/api', notFoundHandler);

  if (env.SERVE_FRONTEND) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', env.FRONTEND_DIR);
    app.use(express.static(dir, { index: 'index.html', maxAge: env.NODE_ENV === 'production' ? '1h' : 0 }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dir, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
