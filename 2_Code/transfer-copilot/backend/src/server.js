import env from './config/env.js';
import { pool } from './config/db.js';
import { createApp } from './app.js';
import { startIntakeWorker } from './services/intake.service.js';
import { resumeInterruptedJobs } from './services/transcript.service.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`Transfer-credit API listening on http://localhost:${env.PORT} (auth: ${env.AUTH_PROVIDER}, demo mode: ${env.DEMO_MODE})`);
});
const stopWorker = startIntakeWorker(env.INTAKE_WORKER_INTERVAL_MS);
if (env.NODE_ENV !== 'test') {
  resumeInterruptedJobs().then((n) => { if (n) console.log(`[transcripts] resumed ${n} interrupted processing job${n > 1 ? 's' : ''}`); }).catch((e) => console.error('[transcripts] resume failed:', e.message));
}

const shutdown = (sig) => {
  console.log(`${sig} received, shutting down`);
  stopWorker();
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
