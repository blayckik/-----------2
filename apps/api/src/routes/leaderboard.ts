import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { userCardSelect } from '../services/users.js';

const router = Router();

function since(period: 'today' | 'week' | 'month' | 'all') {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === 'week') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === 'month') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return undefined;
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        type: z.enum(['players', 'wins', 'xp', 'active', 'popular']).default('players'),
        period: z.enum(['today', 'week', 'month', 'all']).default('all'),
        limit: z.coerce.number().int().min(3).max(100).default(50),
      })
      .parse(req.query);

    const dateFilter = since(query.period);
    const createdAt = dateFilter ? { gte: dateFilter } : undefined;
    let entries: Array<{ userId: string; value: number; extra?: number }> = [];

    if (query.type === 'players') {
      const rows = await prisma.gameResult.groupBy({
        by: ['userId'],
        where: createdAt ? { createdAt } : {},
        _sum: { score: true, xpEarned: true },
        _count: { _all: true },
      });
      entries = rows.map((row) => ({
        userId: row.userId,
        value: row._sum.score ?? 0,
        extra: row._count._all,
      }));
    } else if (query.type === 'wins') {
      const rows = await prisma.gameResult.groupBy({
        by: ['userId'],
        where: { outcome: 'WIN', ...(createdAt ? { createdAt } : {}) },
        _count: { _all: true },
        _sum: { score: true },
      });
      entries = rows.map((row) => ({
        userId: row.userId,
        value: row._count._all,
        extra: row._sum.score ?? 0,
      }));
    } else if (query.type === 'xp') {
      const rows = await prisma.gameResult.groupBy({
        by: ['userId'],
        where: createdAt ? { createdAt } : {},
        _sum: { xpEarned: true },
      });
      entries = rows.map((row) => ({ userId: row.userId, value: row._sum.xpEarned ?? 0 }));
    } else if (query.type === 'active') {
      const rows = await prisma.activityLog.groupBy({
        by: ['userId'],
        where: { userId: { not: null }, ...(createdAt ? { createdAt } : {}) },
        _count: { _all: true },
      });
      entries = rows
        .filter((row): row is typeof row & { userId: string } => Boolean(row.userId))
        .map((row) => ({ userId: row.userId, value: row._count._all }));
    } else {
      const rows = await prisma.post.groupBy({
        by: ['authorId'],
        where: { isDeleted: false, ...(createdAt ? { createdAt } : {}) },
        _sum: { likeCount: true, commentCount: true },
      });
      entries = rows.map((row) => ({
        userId: row.authorId,
        value: row._sum.likeCount ?? 0,
        extra: row._sum.commentCount ?? 0,
      }));
    }

    entries.sort((a, b) => b.value - a.value || (b.extra ?? 0) - (a.extra ?? 0));
    entries = entries.slice(0, query.limit);

    const users = await prisma.user.findMany({
      where: { id: { in: entries.map((entry) => entry.userId) }, isBanned: false },
      select: { ...userCardSelect, xp: true, coins: true },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));

    const leaderboard = entries
      .filter((entry) => userMap.has(entry.userId))
      .map((entry, index) => ({
        rank: index + 1,
        value: entry.value,
        extra: entry.extra ?? 0,
        user: userMap.get(entry.userId),
      }));

    return ok(res, {
      type: query.type,
      period: query.period,
      leaderboard,
      me: leaderboard.find((entry) => entry.user?.id === req.auth!.id) ?? null,
    });
  }),
);

export default router;
