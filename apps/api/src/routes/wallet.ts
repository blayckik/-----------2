import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { dateKey, grantDailyReward } from '../services/progress.js';
import { notifyUser } from '../services/notifications.js';

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

export default router;
