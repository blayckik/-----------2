import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { awardRewards, ensureQuestWindows, periodKey } from '../services/progress.js';
import { notifyUser } from '../services/notifications.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    await ensureQuestWindows(userId);

    const rows = await prisma.userQuest.findMany({
      where: {
        userId,
        periodKey: { in: [periodKey('DAILY'), periodKey('WEEKLY'), 'once', 'global'] },
        quest: { isActive: true },
      },
      include: { quest: true },
      orderBy: [{ quest: { period: 'asc' } }, { quest: { sortOrder: 'asc' } }],
    });

    const grouped = { daily: [] as typeof rows, weekly: [] as typeof rows, onboarding: [] as typeof rows, special: [] as typeof rows };
    for (const row of rows) {
      if (row.quest.period === 'DAILY') grouped.daily.push(row);
      else if (row.quest.period === 'WEEKLY') grouped.weekly.push(row);
      else if (row.quest.period === 'ONBOARDING') grouped.onboarding.push(row);
      else grouped.special.push(row);
    }

    return ok(res, {
      ...grouped,
      completed: rows.filter((row) => row.completedAt).length,
      claimable: rows.filter((row) => row.completedAt && !row.claimedAt).length,
      total: rows.length,
    });
  }),
);

router.post(
  '/:id/claim',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const row = await prisma.userQuest.findUnique({
      where: { id: req.params.id },
      include: { quest: true },
    });
    if (!row || row.userId !== userId) return notFound('Задание не найдено');
    if (!row.completedAt) throw badRequest('Задание ещё не выполнено');
    if (row.claimedAt) throw badRequest('Награда уже получена');

    const updated = await prisma.userQuest.updateMany({
      where: { id: row.id, claimedAt: null, completedAt: { not: null } },
      data: { claimedAt: new Date() },
    });
    if (updated.count === 0) throw badRequest('Награда уже получена');

    await awardRewards({
      userId,
      xp: row.quest.xpReward,
      coins: row.quest.coinReward,
      type: 'QUEST',
      description: `Задание: ${row.quest.title}`,
      reference: `quest:${row.id}`,
      metadata: { questCode: row.quest.code, periodKey: row.periodKey },
    });
    await notifyUser({
      userId,
      type: 'REWARD',
      title: 'Награда получена 🎁',
      body: `${row.quest.title}: +${row.quest.xpReward} XP, +${row.quest.coinReward} FUN Coins`,
    });

    return ok(res, {
      claimed: true,
      xp: row.quest.xpReward,
      coins: row.quest.coinReward,
      quest: row.quest,
    });
  }),
);

router.get(
  '/achievements',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [achievements, unlocked] = await Promise.all([
      prisma.achievement.findMany({ where: { isActive: true }, orderBy: [{ rarity: 'asc' }, { threshold: 'asc' }] }),
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

export default router;
