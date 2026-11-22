import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Local development database: PGlite — the actual PostgreSQL engine compiled to
 * WASM. It speaks the PostgreSQL wire protocol through pglite-socket, so Prisma
 * connects to it exactly like it connects to PostgreSQL in production.
 *
 * Production / Docker use the official postgres:17 image (see docker-compose).
 */
const dataDir = path.resolve('.data/pglite');
const port = Number(process.env.LOCAL_PG_PORT || 5433);

console.log(`Loading PGlite (PostgreSQL) from ${dataDir}…`);
mkdirSync(dataDir, { recursive: true });
const db = await PGlite.create({ dataDir });

const server = new PGLiteSocketServer({
  db,
  port,
  host: '127.0.0.1',
  maxConnections: 20,
});

await server.start();

console.log('');
console.log('  FUNBOX PostgreSQL (PGlite wire protocol) is running');
console.log(`  postgresql://postgres:funbox@127.0.0.1:${port}/postgres`);
console.log('  Press Ctrl+C to stop.');
console.log('');

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping database…');
  try {
    await server.stop();
    await db.close();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 60_000);
