#!/bin/sh
set -eu

cd /app/apps/api

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying Prisma migrations…"
  ./node_modules/.bin/prisma migrate deploy
fi

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "Seeding production content (without demo users)…"
  SEED_MODE=production ./node_modules/.bin/tsx prisma/seed.ts || echo "Seed skipped/failed — continuing"
fi

if [ "${RUN_BOT:-false}" = "true" ] && [ -n "${BOT_TOKEN:-}" ]; then
  echo "Starting Telegram bot in background…"
  node /app/apps/bot/dist/index.js &
fi

exec node dist/index.js
