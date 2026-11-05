#!/bin/sh
set -eu

cd /app/apps/api

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying Prisma migrations…"
  ./node_modules/.bin/prisma migrate deploy
fi

exec node dist/index.js
