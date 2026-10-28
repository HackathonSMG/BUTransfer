import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp() {
  const app = express();

  // Azure App Service / Container Apps sit behind one proxy hop; without this the rate
  // limiter sees every user as the proxy's IP and they all share one quota
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: env.NODE_ENV === 'production' }));

  const allowedOrigins = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:4000'];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS policy violation: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Intake-Secret'],
    credentials: true,
    maxAge: 86400,
  }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again after 15 minutes.' } },
    // Azure App Service forwards IP as IP:PORT — strip the port so the rate limiter key is valid
    keyGenerator: (req) => (req.ip || req.socket.remoteAddress || 'unknown').replace(/:\d+$/, ''),
    // Skipped in development: every local request shares one IP, and the SPA makes several calls per page
    skip: (req) => req.path === '/health' || env.NODE_ENV === 'development',
  });
  // API only: page loads of the bundled frontend shouldn't use up the quota
  app.use('/api', limiter);

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  if (env.NODE_ENV === 'development' && env.LOG_REQUESTS === 'true') {
    app.use((req, _res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  app.use('/api', apiRoutes);

  // Deployments copy the built React app into backend/public and serve it from the same origin;
  // any non-API route falls back to index.html so client-side routes survive a refresh
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
  if (fs.existsSync(path.join(publicDir, 'index.html'))) {
    app.use(express.static(publicDir));
    app.get(/^\/(?!api(\/|$)).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  }

  app.use(errorHandler);

  return app;
}

export default createApp;
