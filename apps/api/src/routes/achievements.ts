import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { userCardSelect } from '../services/users.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [achievements, unlocked] = await Promise.all([
      prisma.achievement.findMany({
        where: { isActive: true },
        orderBy: [{ rarity: 'asc' }, { threshold: 'asc' }],
      }),
      prisma.userAchievement.findMany({
        where: { userId: req.auth!.id },
        select: { achievementId: true, unlockedAt: true },
      }),
    ]);
    const map = new Map(unlocked.map((row) => [row.achievementId, row.unlockedAt]));
    return ok(
      res,
      achievements.map((achievement) => ({
        ...achievement,
        unlocked: map.has(achievement.id),
        unlockedAt: map.get(achievement.id) ?? null,
      })),
    );
  }),
);

router.get(
  '/recent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.userAchievement.findMany({
      where: { userId: req.auth!.id },
      include: { achievement: true },
      orderBy: { unlockedAt: 'desc' },
      take: 6,
    });
    return ok(res, rows);
  }),
);

router.get(
  '/user/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [rows, user] = await Promise.all([
      prisma.userAchievement.findMany({
        where: { userId: req.params.id },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
      }),
      prisma.user.findUnique({ where: { id: req.params.id }, select: userCardSelect }),
    ]);
    return ok(res, { achievements: rows, user });
  }),
);

export default router;
