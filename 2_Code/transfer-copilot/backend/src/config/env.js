import { config } from 'dotenv';
config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
import { z } from 'zod';

const bool = (def) => z.string().optional().transform((v) => (v === undefined ? def : v === 'true'));
const num  = (def) => z.string().optional().transform((v) => parseInt(v ?? String(def), 10));

const schema = z.object({
  NODE_ENV:                    z.enum(['development', 'production', 'test']).optional().transform((v) => v ?? 'development'),
  PORT:                        num(4000),
  SUPABASE_URL:                z.string().url(),
  SUPABASE_ANON_KEY:           z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY:   z.string().min(1).optional(),
  DATABASE_URL:                z.string().min(1),
  DATABASE_SSL:                bool(false),
  DATABASE_POOL_MAX:           num(10),
  AUTH_PROVIDER:               z.enum(['supabase', 'local']).optional().transform((v) => v ?? 'supabase'),
  LOCAL_JWT_SECRET:            z.string().min(32).optional(),
  CORS_ORIGINS:                z.string().optional().transform((v) => v ?? 'http://localhost:4000'),
  SERVE_FRONTEND:              bool(true),
  FRONTEND_DIR:                z.string().optional().transform((v) => v ?? '../frontend'),
  DEMO_MODE:                   bool(false),
  DEMO_PASSWORD:               z.string().optional(),
  INTAKE_WORKER_INTERVAL_MS:   num(0),
  UPLOAD_MAX_MB:               num(10),
  LOG_REQUESTS:                bool(false),
  STORAGE_PROVIDER:            z.string().optional().transform((v) => v ?? 'auto'),
  STORAGE_BUCKET:              z.string().optional().transform((v) => v ?? 'transcripts'),
  STORAGE_LOCAL_DIR:           z.string().optional().transform((v) => v ?? './storage'),
  ANTHROPIC_API_KEY:           z.string().optional(),
  CLAUDE_MODEL:                z.string().optional().transform((v) => v ?? 'claude-opus-5-5'),
  PROCESSING_STAGE_DELAY_MS:   num(0),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid environment configuration:\n', JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

const env = result.data;

if (env.NODE_ENV === 'production' && env.AUTH_PROVIDER === 'local') {
  console.error('AUTH_PROVIDER=local is not allowed in production');
  process.exit(1);
}

export default env;
