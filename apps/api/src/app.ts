import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { asyncHandler, errorHandler, fail, ok } from './lib/http.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { uploadDir } from './middleware/upload.js';

import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import meRoutes from './routes/me.js';
import socialRoutes from './routes/social.js';
import friendsRoutes from './routes/friends.js';
import chatRoutes from './routes/chat.js';
import gameRoutes from './routes/games.js';
import questRoutes from './routes/quests.js';
import achievementRoutes from './routes/achievements.js';
import leaderboardRoutes from './routes/leaderboard.js';
import walletRoutes from './routes/wallet.js';
import notificationRoutes from './routes/notifications.js';
import searchRoutes from './routes/search.js';
import uploadRoutes from './routes/upload.js';
import adminRoutes from './routes/admin.js';
import botRoutes from './routes/bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://telegram.org'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:', 'https:'],
          frameAncestors: ["'self'", 'https://web.telegram.org', 'https://*.telegram.org'],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin) || env.isDevelopment) return callback(null, true);
        return callback(new Error('Origin is not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use('/uploads', express.static(uploadDir, { maxAge: '7d', fallthrough: true }));

  app.get('/api/health', asyncHandler(async (_req, res) => {
    let database = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }
    return ok(res, {
      status: database ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime()),
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  }));

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/friends', friendsRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/quests', questRoutes);
  app.use('/api/achievements', achievementRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/bot', botRoutes);

  app.use('/api', (req, res) => fail(res, 404, `API route ${req.method} ${req.originalUrl} not found`, 'NOT_FOUND'));

  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { maxAge: '1h', index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/uploads')) {
        return next();
      }
      return res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
