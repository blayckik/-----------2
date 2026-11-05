import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { validateInitData, isAdminTelegramId, type TelegramUser } from '../lib/telegram.js';
import { signToken } from '../lib/jwt.js';
import { asyncHandler, badRequest, ok } from '../lib/http.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { awardRewards, trackMetric } from '../services/progress.js';
import { notifyUser, logActivity } from '../services/notifications.js';

const router = Router();

function referralCode() {
  return randomBytes(5).toString('hex').toUpperCase();
}

async function createUser(data: {
  telegramId: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  languageCode?: string | null;
  startParam?: string;
  role?: 'USER' | 'ADMIN' | 'MODERATOR';
}) {
  let referrerId: string | null = null;
  if (data.startParam) {
    const code = data.startParam.replace(/^ref_/, '');
    const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (referrer) referrerId = referrer.id;
  }

  const role = data.role ?? (isAdminTelegramId(data.telegramId) ? 'ADMIN' : 'USER');

  const user = await prisma.user.create({
    data: {
      telegramId: data.telegramId,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      username: data.username ?? null,
      avatarUrl: data.avatarUrl ?? null,
      languageCode: data.languageCode ?? 'ru',
      role,
      referralCode: referralCode(),
      referredById: referrerId,
      profile: { create: {} },
      settings: { create: {} },
      stats: { create: {} },
      wallet: { create: {} },
    },
  });

  await awardRewards({
    userId: user.id,
    xp: 30,
    coins: 100,
    type: 'BONUS',
    description: 'Добро пожаловать в FUNBOX',
    reference: `welcome:${user.id}`,
  });

  if (referrerId) {
    await trackMetric(referrerId, 'REFERRALS', 1);
    await awardRewards({
      userId: referrerId,
      xp: 80,
      coins: 150,
      type: 'REFERRAL',
      description: `Приглашён друг: ${user.firstName}`,
      reference: `referral:${user.id}`,
      metadata: { invitedUserId: user.id },
    });
    await notifyUser({
      userId: referrerId,
      type: 'REWARD',
      title: 'Новый друг в FUNBOX 🎁',
      body: `${user.firstName} присоединился по вашей ссылке. Награда: 150 FUN Coins и 80 XP.`,
    });
  }

  return user;
}

function authResponse(user: { id: string; role: 'USER' | 'MODERATOR' | 'ADMIN' }) {
  return { token: signToken({ sub: user.id, role: user.role }) };
}

function usernameConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}

async function upsertTelegramUser(tg: TelegramUser, startParam?: string) {
  const existing = await prisma.user.findUnique({ where: { telegramId: String(tg.id) } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName: tg.first_name,
        lastName: tg.last_name ?? null,
        avatarUrl: tg.photo_url ?? existing.avatarUrl,
        languageCode: tg.language_code ?? existing.languageCode,
        lastActiveAt: new Date(),
        username: tg.username ?? existing.username,
      },
    });
    return updated;
  }

  try {
    return await createUser({
      telegramId: String(tg.id),
      firstName: tg.first_name,
      lastName: tg.last_name,
      username: tg.username,
      avatarUrl: tg.photo_url,
      languageCode: tg.language_code,
      startParam,
    });
  } catch (error) {
    if (usernameConflict(error) && tg.username) {
      return createUser({
        telegramId: String(tg.id),
        firstName: tg.first_name,
        lastName: tg.last_name,
        username: null,
        avatarUrl: tg.photo_url,
        languageCode: tg.language_code,
        startParam,
      });
    }
    throw error;
  }
}

router.post(
  '/telegram',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ initData: z.string().min(1).max(4096), startParam: z.string().max(64).nullish() })
      .parse(req.body);
    const validated = validateInitData(body.initData);
    const user = await upsertTelegramUser(validated.user, validated.startParam ?? body.startParam ?? undefined);
    await logActivity(user.id, 'auth.telegram', undefined, req.ip);
    return ok(res, {
      ...authResponse(user),
      user: {
        id: user.id,
        firstName: user.firstName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        role: user.role,
        level: user.level,
        coins: user.coins,
      },
    });
  }),
);

router.post(
  '/dev',
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!env.demoAuthEnabled) return badRequest('Demo-авторизация отключена');

    const body = z
      .object({
        telegramId: z.string().regex(/^\d{5,20}$/).optional(),
        firstName: z.string().min(1).max(64).optional(),
        username: z.string().min(3).max(32).optional(),
        startParam: z.string().max(64).nullish(),
      })
      .parse(req.body ?? {});

    const demoAccounts: Record<string, { firstName: string; username: string }> = {
      '900000000': { firstName: 'Алекс', username: 'funbox_admin' },
      '900000001': { firstName: 'Нова', username: 'nova_fun' },
      '900000002': { firstName: 'Макс', username: 'max_play' },
      '900000003': { firstName: 'Ева', username: 'eva_quiz' },
      '900000004': { firstName: 'Лео', username: 'leo_words' },
    };

    const telegramId = body.telegramId ?? '900000001';
    const account = demoAccounts[telegramId];
    const existing = await prisma.user.findUnique({ where: { telegramId } });
    const user =
      existing ??
      (await createUser({
        telegramId,
        firstName: body.firstName ?? account?.firstName ?? 'Гость',
        username: body.username ?? account?.username ?? null,
        avatarUrl: null,
        startParam: body.startParam ?? undefined,
        role: telegramId === '900000000' ? 'ADMIN' : 'USER',
      }));

    await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    await logActivity(user.id, 'auth.dev', undefined, req.ip);

    return ok(res, {
      ...authResponse(user),
      user: {
        id: user.id,
        firstName: user.firstName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        role: user.role,
        level: user.level,
        coins: user.coins,
      },
    });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        stats: true,
        settings: true,
        wallet: true,
        _count: {
          select: {
            achievements: true,
            posts: true,
            notifications: { where: { readAt: null } },
          },
        },
      },
    });
    return ok(res, user);
  }),
);

export default router;
