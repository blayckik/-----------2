import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import {
  dateKey,
  ensureQuestWindows,
  levelProgress,
  periodKey,
} from '../services/progress.js';
import { blockedUserIds, friendIds, userCardSelect } from '../services/users.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    await ensureQuestWindows(userId);

    const dailyKey = periodKey('DAILY');
    const weeklyKey = periodKey('WEEKLY');
    const blocked = await blockedUserIds(userId);
    const friends = await friendIds(userId);

    const [
      user,
      dailyQuests,
      weeklyQuests,
      events,
      games,
      topPlayers,
      recommendations,
      unread,
      dailyClaim,
      recentResults,
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          profile: true,
          stats: true,
          wallet: true,
          _count: {
            select: {
              achievements: true,
              posts: true,
              quests: { where: { claimedAt: { not: null } } },
            },
          },
        },
      }),
      prisma.userQuest.findMany({
        where: { userId, periodKey: dailyKey, quest: { isActive: true } },
        include: { quest: true },
        orderBy: { quest: { sortOrder: 'asc' } },
      }),
      prisma.userQuest.findMany({
        where: { userId, periodKey: weeklyKey, quest: { isActive: true } },
        include: { quest: true },
        orderBy: { quest: { sortOrder: 'asc' } },
      }),
      prisma.platformEvent.findMany({
        where: { isActive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
        orderBy: { endsAt: 'asc' },
        take: 3,
      }),
      prisma.game.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.user.findMany({
        where: { isBanned: false },
        orderBy: [{ xp: 'desc' }, { level: 'desc' }],
        take: 5,
        select: { ...userCardSelect, xp: true },
      }),
      prisma.user.findMany({
        where: {
          id: { notIn: [userId, ...blocked, ...friends] },
          isBanned: false,
          stats: { gamesPlayed: { gt: 0 } },
        },
        orderBy: { lastActiveAt: 'desc' },
        take: 6,
        select: userCardSelect,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.dailyClaim.findUnique({ where: { userId_dateKey: { userId, dateKey: dateKey() } } }),
      prisma.gameResult.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 4,
        include: { game: true, room: { include: { game: true } } },
      }),
    ]);

    const withPlayers = await Promise.all(
      games.map(async (game) => ({
        ...game,
        activePlayers: await prisma.gameParticipant.count({
          where: { room: { gameId: game.id, status: 'PLAYING' } },
        }),
        roomsCount: await prisma.gameRoom.count({ where: { gameId: game.id } }),
      })),
    );

    return ok(res, {
      user,
      level: levelProgress(user.xp),
      dailyQuests,
      weeklyQuests,
      events,
      popularGames: withPlayers,
      topPlayers,
      recommendations,
      unreadNotifications: unread,
      dailyAvailable: !dailyClaim,
      dailyDay: dailyClaim?.day ?? 0,
      recentResults,
      friendsCount: friends.length,
      onlineNow: Math.max(
        1,
        await prisma.user.count({
          where: { lastActiveAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
        }),
      ),
    });
  }),
);

export default router;
