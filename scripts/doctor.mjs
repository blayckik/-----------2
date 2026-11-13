#!/usr/bin/env node
/**
 * FUNBOX doctor — быстрая проверка локальной конфигурации без зависимостей.
 * Запуск: pnpm doctor [--strict]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const errors = [];
const warnings = [];
const passed = [];

function readEnv(file) {
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

function check(condition, label, detail = '') {
  if (condition) passed.push(`${label}${detail ? ` (${detail})` : ''}`);
  else errors.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function warn(condition, label, detail = '') {
  if (condition) passed.push(label);
  else warnings.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

const apiEnvPath = path.join(root, 'apps/api/.env');
const botEnvPath = path.join(root, 'apps/bot/.env');
const webEnvPath = path.join(root, 'apps/web/.env');
const apiEnv = readEnv(apiEnvPath);
const botEnv = readEnv(botEnvPath);
const webEnv = readEnv(webEnvPath);

console.log('\nFUNBOX doctor\n──────────────');

check(existsSync(apiEnvPath), 'apps/api/.env найден');
check(existsSync(botEnvPath), 'apps/bot/.env найден');
check(existsSync(webEnvPath), 'apps/web/.env найден');

check(Boolean(apiEnv.DATABASE_URL), 'DATABASE_URL задан');
check((apiEnv.JWT_SECRET ?? '').length >= 24, 'JWT_SECRET не короче 24 символов');
check((apiEnv.BOT_SECRET ?? '').length >= 8, 'BOT_SECRET не короче 8 символов');
check(
  Boolean(apiEnv.CORS_ORIGINS?.includes('localhost') || apiEnv.CORS_ORIGINS?.includes('127.0.0.1')),
  'CORS_ORIGINS содержит локальный origin',
  apiEnv.CORS_ORIGINS ?? 'не задан',
);
warn(apiEnv.DEMO_AUTH_ENABLED === 'true', 'Demo-авторизация включена (только для разработки)');
warn(Boolean(apiEnv.BOT_TOKEN), 'BOT_TOKEN для Telegram-бота', 'не задан — demo-режим, бот не запустится');
check(Boolean(botEnv.API_URL), 'bot API_URL задан', botEnv.API_URL ?? 'не задан');
check(botEnv.BOT_SECRET === apiEnv.BOT_SECRET, 'BOT_SECRET совпадает в API и боте');
check(Boolean(webEnv.VITE_DEMO_MODE), 'VITE_DEMO_MODE задан', webEnv.VITE_DEMO_MODE ?? '');
check(
  apiEnv.BOT_USERNAME === botEnv.BOT_USERNAME && apiEnv.BOT_USERNAME === webEnv.VITE_BOT_USERNAME,
  'BOT_USERNAME одинаковый в API, боте и web',
);

const requiredFiles = [
  'apps/api/prisma/schema.prisma',
  'apps/api/prisma/seed.ts',
  'apps/api/prisma/migrations/migration_lock.toml',
  'apps/web/index.html',
  'docker-compose.yml',
  'Dockerfile',
  'README.md',
];
for (const file of requiredFiles) {
  check(existsSync(path.join(root, file)), `Файл на месте: ${file}`);
}

const migrationsDir = path.join(root, 'apps/api/prisma/migrations');
const migrations = existsSync(migrationsDir)
  ? readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : [];
check(migrations.length >= 2, 'Prisma-миграции найдены', `${migrations.length} шт.`);

const imagesDir = path.join(root, 'apps/web/public/images/guess');
const images = existsSync(imagesDir)
  ? readdirSync(imagesDir).filter((file) => /\.(jpe?g|png|webp)$/i.test(file)).length
  : 0;
check(images >= 20, 'Изображения Guess the Image на месте', `${images} фото`);

const avatarsDir = path.join(root, 'apps/web/public/avatars');
const avatars = existsSync(avatarsDir)
  ? readdirSync(avatarsDir).filter((file) => file.endsWith('.svg')).length
  : 0;
check(avatars >= 10, 'Локальные аватары на месте', `${avatars} SVG`);

warn(existsSync(path.join(root, 'node_modules')), 'node_modules', 'отсутствуют — выполните pnpm install');
warn(!existsSync(path.join(root, '.data/pglite')), '.data не раздувает репозиторий', 'локальная БД отсутствует');
warn(migrationsOk(), 'Seed-скрипт использует PostgreSQL-миграции');

function migrationsOk() {
  return existsSync(path.join(root, 'apps/api/prisma/migrations/20260511000000_init/migration.sql'));
}

console.log('OK:');
for (const item of passed) console.log(`  ✓ ${item}`);
if (warnings.length) {
  console.log('\nWARN:');
  for (const item of warnings) console.log(`  ⚠ ${item}`);
}
if (errors.length) {
  console.log('\nERROR:');
  for (const item of errors) console.log(`  ✗ ${item}`);
}

console.log(
  `\nИтог: ${passed.length} OK, ${warnings.length} предупреждений, ${errors.length} ошибок.`,
);

if (errors.length || (strict && warnings.length)) {
  console.log('\nИсправьте ошибки перед запуском. Инструкция: README.md');
  process.exit(1);
}
console.log('Конфигурация готова к локальному запуску.\n');
