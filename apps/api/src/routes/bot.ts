import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, notFound, ok } from '../lib/http.js';
import { requireBot } from '../middleware/auth.js';
import { dateKey, grantDailyReward, levelProgress } from '../services/progress.js';
import { env } from '../config/env.js';

const router = Router();
router.use(requireBot);

router.get(
  '/user/:telegramId',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { telegramId: req.params.telegramId },
      include: {
        profile: true,
        stats: true,
        achievements: { include: { achievement: true }, orderBy: { unlockedAt: 'desc' }, take: 3 },
      },
    });
    if (!user) return notFound('Пользователь ещё не открывал FUNBOX');
    const [daily, rank, friends] = await Promise.all([
      prisma.dailyClaim.findUnique({
        where: { userId_dateKey: { userId: user.id, dateKey: dateKey() } },
      }),
      prisma.user.count({ where: { xp: { gt: user.xp }, isBanned: false } }),
      prisma.friendship.count({
        where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
      }),
    ]);
    return ok(res, {
      id: user.id,
      telegramId: user.telegramId,
      name: user.profile?.displayName || [user.firstName, user.lastName].filter(Boolean).join(' '),
      username: user.username,
      avatarUrl: user.avatarUrl,
      level: user.level,
      levelProgress: levelProgress(user.xp),
      xp: user.xp,
      coins: user.coins,
      role: user.role,
      isBanned: user.isBanned,
      stats: user.stats,
      achievements: user.achievements,
      friends,
      rank: rank + 1,
      dailyAvailable: !daily,
      dailyDay: daily?.day ?? 0,
      referralCode: user.referralCode,
    });
  }),
);

router.post(
  '/daily',
  asyncHandler(async (req, res) => {
    const body = z.object({ telegramId: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { telegramId: body.telegramId } });
    if (!user) return notFound('Пользователь ещё не открывал FUNBOX');
    if (user.isBanned) return notFound('Аккаунт заблокирован');
    const result = await grantDailyReward(user.id);
    if (result.claimed) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'DAILY',
          title: `Ежедневная награда · день ${result.day}`,
          body: `+${result.xp} XP и +${result.coins} FUN Coins зачислены.`,
        },
      });
    }
    return ok(res, result);
  }),
);

router.get(
  '/leaderboard',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { isBanned: false },
      orderBy: [{ xp: 'desc' }, { level: 'desc' }],
      take: 5,
      select: {
        id: true,
        firstName: true,
        username: true,
        avatarUrl: true,
        level: true,
        xp: true,
        profile: { select: { displayName: true } },
      },
    });
    return ok(res, users);
  }),
);

router.get(
  '/games',
  asyncHandler(async (_req, res) => {
    const games = await prisma.game.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return ok(res, games);
  }),
);

router.get(
  '/invite/:telegramId',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { telegramId: req.params.telegramId } });
    if (!user) return notFound('Пользователь не найден');
    return ok(res, {
      referralCode: user.referralCode,
      link: `https://t.me/${env.BOT_USERNAME}?start=ref_${user.referralCode}`,
      appLink: `https://t.me/${env.BOT_USERNAME}?startapp=ref_${user.referralCode}`,
    });
  }),
);

router.get(
  '/settings/:telegramId',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { telegramId: req.params.telegramId },
      include: { settings: true },
    });
    if (!user) return notFound('Пользователь не найден');
    return ok(
      res,
      user.settings ?? {
        notifyDaily: true,
        notifyMessages: true,
        notifyFriends: true,
        notifyAchievements: true,
        notifyGameInvites: true,
      },
    );
  }),
);

router.post(
  '/settings/:telegramId',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        notifyDaily: z.boolean().optional(),
        notifyMessages: z.boolean().optional(),
        notifyFriends: z.boolean().optional(),
        notifyAchievements: z.boolean().optional(),
        notifyGameInvites: z.boolean().optional(),
      })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { telegramId: req.params.telegramId } });
    if (!user) return notFound('Пользователь не найден');
    const settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: body,
      create: { userId: user.id, ...body },
    });
    return ok(res, settings);
  }),
);

router.get(
  '/daily-reminders',
  asyncHandler(async (_req, res) => {
    const today = dateKey();
    const users = await prisma.user.findMany({
      where: {
        isBanned: false,
        lastActiveAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        settings: { notifyDaily: true },
        dailyClaims: { none: { dateKey: today } },
      },
      select: { telegramId: true, firstName: true },
      take: 100,
    });
    return ok(res, users);
  }),
);

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [users, games, posts, messages, rooms] = await Promise.all([
      prisma.user.count(),
      prisma.gameResult.count(),
      prisma.post.count({ where: { isDeleted: false } }),
      prisma.message.count({ where: { isDeleted: false } }),
      prisma.gameRoom.count({ where: { status: 'PLAYING' } }),
    ]);
    return ok(res, { users, games, posts, messages, activeRooms: rooms });
  }),
);

export default router;
