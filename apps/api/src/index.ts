import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { setIO } from './lib/io.js';
import { initSockets } from './sockets/index.js';
import { ensureGameCatalog } from './services/gameCatalog.js';
import { ensureShopCatalog } from './services/shopCatalog.js';

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  path: '/socket.io',
  cors: {
    origin: env.isDevelopment ? true : env.corsOrigins,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

setIO(io);
initSockets(io);

async function start() {
  try {
    await ensureGameCatalog();
    await ensureShopCatalog();
  } catch (error) {
    console.error('[game-catalog]', error);
  }

  server.listen(env.PORT, () => {
    console.log('');
    console.log('  FUNBOX API');
    console.log(`  REST      http://localhost:${env.PORT}/api`);
    console.log(`  Socket.IO http://localhost:${env.PORT}/socket.io`);
    console.log(`  Mode      ${env.NODE_ENV}`);
    console.log(`  WebApp    ${env.APP_URL}`);
    console.log('');
  });
}

void start();

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down…`);
  io.close();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
