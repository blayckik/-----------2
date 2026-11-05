import type { Prisma, QuestMetric, QuestPeriod } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http.js';
import { notifyUser, logActivity } from './notifications.js';

export const METRIC_STAT_FIELD: Record<QuestMetric, keyof Prisma.UserStatUpdateInput> = {
  GAMES_PLAYED: 'gamesPlayed',
  GAMES_WON: 'gamesWon',
  QUIZ_WINS: 'quizWins',
  FRIENDS_ADDED: 'friendsCount',
  POSTS_CREATED: 'postsCount',
  COMMENTS_CREATED: 'commentsCount',
  LIKES_GIVEN: 'likesGiven',
  LIKES_RECEIVED: 'likesReceived',
  MESSAGES_SENT: 'messagesSent',
  LOGIN_STREAK: 'loginStreak',
  REFERRALS: 'referrals',
  XP_EARNED: 'xpEarned',
  COINS_EARNED: 'coinsEarned',
  IMAGES_GUESSED: 'imagesGuessed',
  WORDS_SUBMITTED: 'wordsSubmitted',
  WYR_VOTES: 'wyrVotes',
  PROFILE_COMPLETED: 'profileCompleted',
};

export function levelFromXp(xp: number): number {
  return Math.min(100, Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1));
}

export function xpForLevel(level: number): number {
  return Math.max(0, (level - 1) ** 2 * 50);
}

export function nextLevelXp(xp: number): number {
  const level = levelFromXp(xp);
  return level >= 100 ? xp : xpForLevel(level + 1);
}

export function levelProgress(xp: number): { level: number; current: number; needed: number; percent: number } {
  const level = levelFromXp(xp);
  const start = xpForLevel(level);
  const end = level >= 100 ? Math.max(start + 1, xp + 1) : xpForLevel(level + 1);
  const current = xp - start;
  const needed = Math.max(1, end - start);
  return { level, current, needed, percent: Math.min(100, Math.round((current / needed) * 100)) };
}

function moscowDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function dateKey(date = new Date()): string {
  const { year, month, day } = moscowDateParts(date);
  return `${year}-${month}-${day}`;
}

export function yesterdayKey(date = new Date()): string {
  const d = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return dateKey(d);
}

function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function periodKey(period: QuestPeriod, date = new Date()): string {
  switch (period) {
    case 'DAILY':
      return `daily:${dateKey(date)}`;
    case 'WEEKLY':
      return `weekly:${isoWeekKey(date)}`;
    case 'ONBOARDING':
      return 'once';
    default:
      return 'global';
  }
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Ensures the user has quest rows for the current daily/weekly windows.
 * Safe to call on every dashboard/quests request.
 */
export async function ensureQuestWindows(userId: string, db: Db = prisma) {
  const quests = await db.quest.findMany({ where: { isActive: true } });
  if (!quests.length) return;
  await db.userQuest.createMany({
    data: quests.map((quest) => ({
      userId,
      questId: quest.id,
      periodKey: periodKey(quest.period),
      progress: 0,
    })),
    skipDuplicates: true,
  });
}

async function updateQuestProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  metric: QuestMetric,
  amount: number,
) {
  const quests = await tx.quest.findMany({ where: { metric, isActive: true } });
  for (const quest of quests) {
    const key = periodKey(quest.period);
    const row = await tx.userQuest.upsert({
      where: { userId_questId_periodKey: { userId, questId: quest.id, periodKey: key } },
      update: { progress: { increment: amount } },
      create: { userId, questId: quest.id, periodKey: key, progress: amount },
    });
    if (row.progress >= quest.target && !row.completedAt) {
      await tx.userQuest.update({
        where: { id: row.id },
        data: { completedAt: new Date() },
      });
    }
  }
}

async function unlockAchievements(tx: Prisma.TransactionClient, userId: string) {
  const stat = await tx.userStat.findUnique({ where: { userId } });
  if (!stat) return [];

  const achievements = await tx.achievement.findMany({
    where: { isActive: true, metric: { not: null }, threshold: { gt: 0 } },
  });
  if (!achievements.length) return [];

  const existing = await tx.userAchievement.findMany({
    where: { userId, achievementId: { in: achievements.map((a) => a.id) } },
    select: { achievementId: true },
  });
  const unlockedIds = new Set(existing.map((row) => row.achievementId));
  const newlyUnlocked = achievements.filter((achievement) => {
    if (unlockedIds.has(achievement.id) || !achievement.metric) return false;
    const field = METRIC_STAT_FIELD[achievement.metric];
    const value = Number(stat[field as keyof typeof stat] ?? 0);
    return value >= achievement.threshold;
  });

  if (!newlyUnlocked.length) return [];

  await tx.userAchievement.createMany({
    data: newlyUnlocked.map((achievement) => ({ userId, achievementId: achievement.id })),
    skipDuplicates: true,
  });

  for (const achievement of newlyUnlocked) {
    const xp = achievement.xpReward;
    const coins = achievement.coinReward;
    if (!xp && !coins) continue;
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { xp: { increment: xp }, coins: { increment: coins } },
      select: { xp: true, level: true },
    });
    const nextLevel = levelFromXp(updatedUser.xp);
    if (nextLevel !== updatedUser.level) {
      await tx.user.update({ where: { id: userId }, data: { level: nextLevel } });
    }
    await tx.wallet.upsert({
      where: { userId },
      update: { totalEarned: { increment: coins } },
      create: { userId, totalEarned: coins },
    });
    await tx.transaction.create({
      data: {
        userId,
        amount: coins,
        type: 'ACHIEVEMENT',
        description: `Достижение: ${achievement.name}`,
        reference: `achievement:${userId}:${achievement.code}`,
        metadata: { xp, achievementCode: achievement.code },
      },
    });
  }

  return newlyUnlocked.map((achievement) => ({
    code: achievement.code,
    name: achievement.name,
    description: achievement.description,
    icon: achievement.icon,
    rarity: achievement.rarity,
    xp: achievement.xpReward,
    coins: achievement.coinReward,
  }));
}

/**
 * Updates lifetime stats, quest progress and achievement unlocks atomically.
 * Returns achievements unlocked by this action.
 */
export async function trackMetric(
  userId: string,
  metric: QuestMetric,
  amount = 1,
  extraStats: Partial<Prisma.UserStatUpdateInput> = {},
) {
  if (amount <= 0) return [];
  const field = METRIC_STAT_FIELD[metric];

  const unlocked = await prisma.$transaction(async (tx) => {
    await tx.userStat.upsert({
      where: { userId },
      update: { ...extraStats, [field]: { increment: amount } },
      create: { userId, [field]: amount },
    });
    await updateQuestProgress(tx, userId, metric, amount);
    return unlockAchievements(tx, userId);
  });

  for (const achievement of unlocked) {
    await notifyUser({
      userId,
      type: 'ACHIEVEMENT',
      title: 'Достижение разблокировано 🏆',
      body: `${achievement.name}: ${achievement.description}. Награда: +${achievement.xp} XP и +${achievement.coins} FUN Coins.`,
      data: { code: achievement.code },
    });
  }

  await logActivity(userId, `metric.${metric.toLowerCase()}`, { amount });

  return unlocked;
}

export async function bumpStats(userId: string, data: Prisma.UserStatUpdateInput) {
  await prisma.userStat.upsert({
    where: { userId },
    update: data,
    create: { userId },
  });
}

/**
 * Idempotent XP + FUN Coins award. Returns false when the reference was already used.
 */
export async function awardRewards(params: {
  userId: string;
  xp?: number;
  coins?: number;
  type: Prisma.TransactionCreateInput['type'];
  description: string;
  reference: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<boolean> {
  const { userId, xp = 0, coins = 0, type, description, reference, metadata } = params;
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({ where: { reference } });
      if (existing) return false;

      const user = await tx.user.update({
        where: { id: userId },
        data: { xp: { increment: xp }, coins: { increment: coins } },
        select: { xp: true, level: true },
      });
      const nextLevel = levelFromXp(user.xp);
      if (nextLevel !== user.level) {
        await tx.user.update({ where: { id: userId }, data: { level: nextLevel } });
      }
      await tx.wallet.upsert({
        where: { userId },
        update: {
          totalEarned: { increment: Math.max(0, coins) },
          totalSpent: { increment: Math.max(0, -coins) },
        },
        create: {
          userId,
          totalEarned: Math.max(0, coins),
          totalSpent: Math.max(0, -coins),
        },
      });
      await tx.userStat.upsert({
        where: { userId },
        update: {
          xpEarned: { increment: Math.max(0, xp) },
          coinsEarned: { increment: Math.max(0, coins) },
        },
        create: { userId, xpEarned: Math.max(0, xp), coinsEarned: Math.max(0, coins) },
      });
      await tx.transaction.create({
        data: { userId, amount: coins, type, description, reference, metadata },
      });
      return true;
    });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return false;
    throw error;
  }
}

export async function spendCoins(params: {
  userId: string;
  amount: number;
  type: Prisma.TransactionCreateInput['type'];
  description: string;
  reference: string;
  metadata?: Prisma.InputJsonValue;
}) {
  if (params.amount <= 0) throw new HttpError(400, 'Сумма должна быть положительной', 'INVALID_AMOUNT');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: params.userId, coins: { gte: params.amount } },
      data: { coins: { decrement: params.amount } },
    });
    if (updated.count === 0) {
      throw new HttpError(400, 'Недостаточно FUN Coins', 'INSUFFICIENT_FUNDS');
    }
    await tx.wallet.upsert({
      where: { userId: params.userId },
      update: { totalSpent: { increment: params.amount } },
      create: { userId: params.userId, totalSpent: params.amount },
    });
    await tx.transaction.create({
      data: {
        userId: params.userId,
        amount: -params.amount,
        type: params.type,
        description: params.description,
        reference: params.reference,
        metadata: params.metadata,
      },
    });
    return true;
  });
}

export async function grantDailyReward(userId: string) {
  const today = dateKey();
  const existing = await prisma.dailyClaim.findUnique({
    where: { userId_dateKey: { userId, dateKey: today } },
  });
  if (existing) {
    return { claimed: false, day: existing.day, xp: existing.xp, coins: existing.coins, nextInMs: msUntilTomorrow() };
  }

  const last = await prisma.dailyClaim.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  const yesterday = yesterdayKey();
  const day = last && last.dateKey === yesterday ? Math.min(7, last.day + 1) : 1;
  const xp = 20 + day * 10;
  const coins = 10 + day * 5;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.dailyClaim.create({ data: { userId, dateKey: today, day, xp, coins } });
    });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return { claimed: false, day, xp, coins, nextInMs: msUntilTomorrow() };
    }
    throw error;
  }

  await awardRewards({
    userId,
    xp,
    coins,
    type: 'DAILY',
    description: `Ежедневная награда · день ${day}`,
    reference: `daily:${userId}:${today}`,
    metadata: { day },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastDailyAt: new Date() } });
  await trackMetric(userId, 'LOGIN_STREAK', 1, {
    loginStreak: { increment: 1 },
    bestLoginStreak: { increment: 0 },
  });
  const stat = await prisma.userStat.findUnique({ where: { userId } });
  if (stat && stat.loginStreak > stat.bestLoginStreak) {
    await prisma.userStat.update({ where: { userId }, data: { bestLoginStreak: stat.loginStreak } });
  }

  return { claimed: true, day, xp, coins, nextInMs: msUntilTomorrow() };
}

export function msUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  return Math.max(0, tomorrow.getTime() - now.getTime());
}
