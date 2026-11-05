import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/jwt.js';
import { fail } from '../lib/http.js';
import { env } from '../config/env.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return fail(res, 401, 'Требуется авторизация', 'UNAUTHORIZED');
    }
    const token = header.slice(7);
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        telegramId: true,
        username: true,
        isBanned: true,
      },
    });
    if (!user) return fail(res, 401, 'Пользователь не найден', 'UNAUTHORIZED');
    if (user.isBanned) return fail(res, 403, 'Аккаунт заблокирован', 'BANNED');

    req.auth = user;
    next();
  } catch {
    return fail(res, 401, 'Сессия истекла, войдите заново', 'UNAUTHORIZED');
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const payload = verifyToken(header.slice(7));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, telegramId: true, username: true, isBanned: true },
    });
    if (user && !user.isBanned) req.auth = user;
  } catch {
    // Optional auth must never block public requests.
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return fail(res, 401, 'Требуется авторизация', 'UNAUTHORIZED');
    if (!roles.includes(req.auth.role)) return fail(res, 403, 'Недостаточно прав', 'FORBIDDEN');
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireModerator = requireRole('ADMIN', 'MODERATOR');

export function requireBot(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers['x-bot-secret'];
  if (typeof secret !== 'string') {
    return fail(res, 401, 'Bot secret is invalid', 'BOT_UNAUTHORIZED');
  }
  const provided = Buffer.from(secret);
  const expected = Buffer.from(env.BOT_SECRET);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return fail(res, 401, 'Bot secret is invalid', 'BOT_UNAUTHORIZED');
  }
  next();
}
