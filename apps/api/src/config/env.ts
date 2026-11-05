import 'dotenv/config';
import { z } from 'zod';

const booleanString = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default('7d'),
  TELEGRAM_INIT_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  DEMO_AUTH_ENABLED: booleanString,
  BOT_TOKEN: z.string().optional().default(''),
  BOT_USERNAME: z.string().default('funbox_demo_bot'),
  BOT_SECRET: z.string().min(8),
  TELEGRAM_WEBAPP_URL: z.string().default('http://localhost:5173'),
  ADMIN_TELEGRAM_IDS: z.string().optional().default(''),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(8),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(180),
  REDIS_URL: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  demoAuthEnabled: raw.DEMO_AUTH_ENABLED && raw.NODE_ENV !== 'production',
  corsOrigins: raw.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  adminTelegramIds: raw.ADMIN_TELEGRAM_IDS.split(',').map((id) => id.trim()).filter(Boolean),
  uploadDir: raw.UPLOAD_DIR,
  maxUploadBytes: raw.MAX_UPLOAD_MB * 1024 * 1024,
};

export type Env = typeof env;
