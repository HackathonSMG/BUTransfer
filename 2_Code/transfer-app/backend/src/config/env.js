import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Core
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Supabase
  SUPABASE_URL: z.string().url({ message: 'SUPABASE_URL must be a valid URL' }),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Postgres
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z.string().optional().default('true'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().optional().default(10),

  // Auth
  AUTH_PROVIDER: z.string().optional().default('supabase'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  STUDENT_TOKEN_SECRET: z.string().min(32, 'STUDENT_TOKEN_SECRET must be at least 32 characters'),

  // CORS
  CORS_ORIGINS: z.string().optional().default('http://localhost:5173,http://localhost:4000'),

  // Microsoft Foundry agent (optional - empty endpoint means the credit engine runs without the agent).
  // Auth: set FOUNDRY_API_KEY for key-based auth (local dev + non-Azure hosting).
  // On Azure App Service leave it unset and use a System-Assigned Managed Identity instead.
  FOUNDRY_PROJECT_ENDPOINT: z.string().optional().transform(v => v || undefined),
  FOUNDRY_AGENT_NAME: z.string().optional().default('bu-transfer-evaluator'),
  FOUNDRY_MODEL_DEPLOYMENT: z.string().optional().transform(v => v || undefined),
  FOUNDRY_API_KEY: z.string().optional().transform(v => v || undefined),

  // Storage
  STORAGE_PROVIDER: z.string().optional().default('supabase'),
  STORAGE_BUCKET: z.string().optional().default('transfer-documents'),
  STORAGE_LOCAL_DIR: z.string().optional().default('./storage'),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional().default('noreply@transferapp.edu'),
  EMAIL_FROM_NAME: z.string().optional().default('BU Transfer Credit Evaluation'),
  // smtp (any SMTP relay: Azure Communication Services, SendGrid, Microsoft 365, Gmail) or log (development:
  // the email is written to the server log, and to EMAIL_OUTBOX_DIR as .html when set). Default: smtp when
  // SMTP_HOST/USER/PASS are set, otherwise log.
  EMAIL_PROVIDER: z.enum(['smtp', 'log']).optional(),
  EMAIL_OUTBOX_DIR: z.string().optional().transform(v => v || undefined),
  // Reserved/test domains are never emailed (synthetic demo applicants use them)
  EMAIL_SUPPRESS_DOMAINS: z.string().optional().default('example.org,example.com,example.net,test,invalid,local,localhost'),
  // Public application lookups (track, existing-application check) per IP per 15 minutes
  TRACK_RATE_LIMIT_MAX: z.coerce.number().int().positive().optional().default(30),

  // App
  APP_URL: z.string().url().optional().default('http://localhost:5173'),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().optional().default(10),
  LOG_REQUESTS: z.string().optional().default('true'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().optional().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;

export default env;
