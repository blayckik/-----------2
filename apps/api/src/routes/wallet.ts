import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { dateKey, grantDailyReward, levelFromXp } from '../services/progress.js';
import { notifyUser } from '../services/notifications.js';
import { randomUUID } from 'node:crypto';

const CASES = [
  {
    code: 'starter',
    name: 'FUN Стартер',
    description: 'Шанс на монеты, опыт или предмет из магазина.',
    price: 100,
    icon: '🎁',
    accent: '#8b5cf6',
  },
  {
    code: 'premium',
    name: 'FUN Премиум',
    description: 'Больше монет и повышенный шанс на косметику.',
    price: 500,
    icon: '💎',
    accent: '#f59e0b',
  },
] as const;

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
    const [user, wallet, transactions, purchases, dailyClaim, stats] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { coins: true, xp: true, level: true },
      }),
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.purchase.findMany({
        where: { userId },
        include: { item: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.dailyClaim.findUnique({ where: { userId_dateKey: { userId, dateKey: dateKey() } } }),
      prisma.userStat.findUnique({ where: { userId } }),
    ]);

    return ok(res, {
      balance: user.coins,
      xp: user.xp,
      level: user.level,
      wallet,
      transactions,
      purchases,
      daily: {
        available: !dailyClaim,
        day: dailyClaim?.day ?? 0,
        lastClaim: dailyClaim,
        potential: {
          xp: 20 + Math.min(7, (dailyClaim?.day ?? 0) + 1) * 10,
          coins: 10 + Math.min(7, (dailyClaim?.day ?? 0) + 1) * 5,
        },
      },
      stats,
    });
  }),
);

router.post(
  '/daily',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await grantDailyReward(req.auth!.id);
    if (result.claimed) {
      await notifyUser({
        userId: req.auth!.id,
        type: 'DAILY',
        title: `Ежедневная награда · день ${result.day}`,
        body: `+${result.xp} XP и +${result.coins} FUN Coins зачислены на счёт. Возвращайтесь завтра!`,
      });
    }
    return ok(res, result);
  }),
);

router.get(
  '/shop',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [items, purchases] = await Promise.all([
      prisma.shopItem.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }] }),
      prisma.purchase.findMany({ where: { userId: req.auth!.id }, select: { itemId: true } }),
    ]);
    const owned = new Set(purchases.map((purchase) => purchase.itemId));
    return ok(
      res,
      items.map((item) => ({ ...item, owned: owned.has(item.id) })),
    );
  }),
);

router.post(
  '/shop/:id/buy',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const item = await prisma.shopItem.findUnique({ where: { id: req.params.id } });
    if (!item || !item.isActive) return notFound('Товар не найден');
    const existing = await prisma.purchase.findUnique({
      where: { userId_itemId: { userId, itemId: item.id } },
    });
    if (existing) throw conflict('Этот товар уже куплен');

    const reference = `shop:${item.id}:${userId}`;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, coins: { gte: item.price } },
        data: { coins: { decrement: item.price } },
      });
      if (updated.count === 0) throw badRequest('Недостаточно FUN Coins');
      await tx.purchase.create({ data: { userId, itemId: item.id, price: item.price } });
      await tx.transaction.create({
        data: {
          userId,
          amount: -item.price,
          type: 'SHOP',
          description: `Покупка: ${item.name}`,
          reference,
          metadata: { itemId: item.id, itemCode: item.code },
        },
      });
      await tx.wallet.upsert({
        where: { userId },
        update: { totalSpent: { increment: item.price } },
        create: { userId, totalSpent: item.price },
      });

      const payload = (item.payload ?? {}) as { accentColor?: string; theme?: string };
      if (payload.accentColor) {
        await tx.userProfile.upsert({
          where: { userId },
          update: { accentColor: payload.accentColor },
          create: { userId, accentColor: payload.accentColor },
        });
      }
      if (payload.theme) {
        await tx.userSettings.upsert({
          where: { userId },
          update: { theme: payload.theme },
          create: { userId, theme: payload.theme },
        });
      }
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } });
    await notifyUser({
      userId,
      type: 'REWARD',
      title: 'Покупка оформлена 🛍️',
      body: `${item.name} теперь в вашей коллекции.`,
    });
    return ok(res, { purchased: true, balance: user.coins, item });
  }),
);

router.get(
  '/cases',
  requireAuth,
  asyncHandler(async (_req, res) => {
    return ok(res, CASES);
  }),
);

router.post(
  '/cases/:code/open',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const definition = CASES.find((entry) => entry.code === req.params.code);
    if (!definition) return notFound('Кейс не найден');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } });
    if (user.coins < definition.price) throw badRequest('Недостаточно FUN Coins');

    const roll = Math.random();
    const itemChance = definition.code === 'premium' ? 0.32 : 0.18;
    let rewardType: 'item' | 'coins' | 'xp' = roll < itemChance ? 'item' : roll < itemChance + 0.55 ? 'coins' : 'xp';

    let rewardCoins = 0;
    let rewardXp = 0;
    let rewardItem: { id: string; name: string; icon: string } | null = null;

    if (rewardType === 'coins') {
      const [min, max] = definition.code === 'premium' ? [500, 1800] : [200, 700];
      rewardCoins = Math.floor(Math.random() * (max - min + 1)) + min;
    } else if (rewardType === 'xp') {
      const [min, max] = definition.code === 'premium' ? [180, 650] : [70, 260];
      rewardXp = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
      const [items, owned] = await Promise.all([
        prisma.shopItem.findMany({ where: { isActive: true }, orderBy: { price: 'desc' } }),
        prisma.purchase.findMany({ where: { userId }, select: { itemId: true } }),
      ]);
      const ownedIds = new Set(owned.map((entry) => entry.itemId));
      const available = items.filter((item) => !ownedIds.has(item.id));
      rewardItem = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : null;
      if (!rewardItem) {
        rewardType = 'coins';
        rewardCoins = definition.code === 'premium' ? 900 : 300;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          coins: { increment: rewardCoins - definition.price },
          xp: { increment: rewardXp },
        },
        select: { coins: true, xp: true, level: true },
      });
      const level = levelFromXp(updated.xp);
      if (level !== updated.level) {
        await tx.user.update({ where: { id: userId }, data: { level } });
      }
      await tx.wallet.upsert({
        where: { userId },
        update: {
          totalSpent: { increment: definition.price },
          totalEarned: { increment: rewardCoins },
        },
        create: {
          userId,
          totalSpent: definition.price,
          totalEarned: rewardCoins,
        },
      });
      if (rewardItem) {
        await tx.purchase.upsert({
          where: { userId_itemId: { userId, itemId: rewardItem.id } },
          update: {},
          create: { userId, itemId: rewardItem.id, price: 0 },
        });
      }
      await tx.transaction.create({
        data: {
          userId,
          amount: rewardCoins - definition.price,
          type: 'SHOP',
          description: `Кейс «${definition.name}»: ${
            rewardItem ? rewardItem.name : rewardCoins > 0 ? `+${rewardCoins} FUN` : `+${rewardXp} XP`
          }`,
          reference: `case:${definition.code}:${userId}:${randomUUID()}`,
          metadata: { case: definition.code, rewardType, rewardCoins, rewardXp, itemId: rewardItem?.id ?? null },
        },
      });
      return { ...updated, level };
    });

    await notifyUser({
      userId,
      type: 'REWARD',
      title: `Кейс «${definition.name}» открыт 🎁`,
      body: rewardItem
        ? `${rewardItem.icon} ${rewardItem.name} — теперь в коллекции.`
        : rewardCoins > 0
          ? `Тебе выпало +${rewardCoins} FUN Coins.`
          : `Тебе выпало +${rewardXp} XP.`,
    });

    return ok(res, {
      case: definition,
      reward: {
        type: rewardType,
        coins: rewardCoins,
        xp: rewardXp,
        item: rewardItem,
      },
      balance: result.coins,
    });
  }),
);

export default router;
