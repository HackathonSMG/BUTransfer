import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { startEmailPoller } from './services/gmail-poller.service.js';

const app = createApp();
const PORT = env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`\n[Server] Transfer App Backend running`);
  console.log(`  Environment : ${env.NODE_ENV}`);
  console.log(`  Port        : ${PORT}`);
  console.log(`  Health      : http://localhost:${PORT}/api/health`);
  console.log(`  Supabase    : ${env.SUPABASE_URL}`);
  console.log(`  Agent       : ${env.FOUNDRY_PROJECT_ENDPOINT ? `Foundry agent ${env.FOUNDRY_AGENT_NAME}` : 'off (credit engine only)'}`);
  console.log(`  Email       : ${env.SMTP_USER || 'not configured'}`);
  console.log();
  startEmailPoller();
});

async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received - shutting down gracefully...`);
  server.close(async () => {
    console.log('[Server] HTTP server closed');
    try { await pool.end(); console.log('[Server] Database pool closed'); } catch (err) { console.error('[Server] Error closing database pool:', err.message); }
    process.exit(0);
  });
  setTimeout(() => { console.error('[Server] Graceful shutdown timed out - forcing exit'); process.exit(1); }, 15000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => { console.error('[Server] Uncaught exception:', err.message, err.stack); process.exit(1); });
process.on('unhandledRejection', (reason) => { console.error('[Server] Unhandled promise rejection:', reason); process.exit(1); });

export default server;
