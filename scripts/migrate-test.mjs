import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('.data/pglite-migrate-test');
const port = 5434;

if (dataDir !== path.resolve('.data/pglite-migrate-test')) {
  throw new Error(`Refusing to delete unexpected path: ${dataDir}`);
}
fs.rmSync(dataDir, { recursive: true, force: true });

const db = await PGlite.create({ dataDir });
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 10 });
await server.start();
console.log(`Fresh PGlite on ${port}`);

const require = createRequire(path.resolve('apps/api/package.json'));
const prismaCli = require.resolve('prisma/build/index.js');
const databaseUrl = `postgresql://postgres:funbox@127.0.0.1:${port}/postgres?schema=public&pgbouncer=true`;

try {
  const child = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: path.resolve('apps/api'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (exitCode !== 0) throw new Error(`prisma migrate deploy exited with ${exitCode}`);
  const result = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const tables = result.rows.map((row) => row.table_name);
  console.log(`Tables after migration: ${tables.length}`);
  console.log(tables.join(', '));
  for (const required of ['User', 'Post', 'GameRoom', 'UserQuest', 'Transaction', 'Follow', 'PlatformEvent', '_prisma_migrations']) {
    if (!tables.includes(required)) throw new Error(`Missing table: ${required}`);
  }
  console.log('✅ Migration deploy validated');
} finally {
  await server.stop();
  await db.close();
}
