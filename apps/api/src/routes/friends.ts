import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { trackMetric } from '../services/progress.js';
import { notifyUser } from '../services/notifications.js';
import { blockedUserIds, friendIds, userCardSelect } from '../services/users.js';
import { env } from '../config/env.js';

const router = Router();

function canonical(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const ids = await friendIds(userId);
    const friends = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: userCardSelect,
      orderBy: { lastActiveAt: 'desc' },
    });
    return ok(res, friends);
  }),
);

router.get(
  '/requests',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const [incoming, outgoing] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { receiverId: userId, status: 'PENDING' },
        include: { sender: { select: userCardSelect } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.friendRequest.findMany({
        where: { senderId: userId, status: 'PENDING' },
        include: { receiver: { select: userCardSelect } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return ok(res, { incoming, outgoing });
  }),
);

router.get(
  '/suggestions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const [friends, blocked] = await Promise.all([friendIds(userId), blockedUserIds(userId)]);
    const pending = await prisma.friendRequest.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }], status: 'PENDING' },
      select: { senderId: true, receiverId: true },
    });
    const excluded = [
      ...new Set([userId, ...friends, ...blocked, ...pending.flatMap((p) => [p.senderId, p.receiverId])]),
    ];
    const users = await prisma.user.findMany({
      where: { id: { notIn: excluded }, isBanned: false },
      select: { ...userCardSelect, xp: true },
      orderBy: [{ lastActiveAt: 'desc' }, { xp: 'desc' }],
      take: 12,
    });
    return ok(res, users);
  }),
);

router.get(
  '/invite',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.id },
      select: { referralCode: true, firstName: true, xp: true, level: true },
    });
    const link = `https://t.me/${env.BOT_USERNAME}?start=ref_${user.referralCode}`;
    const appLink = `https://t.me/${env.BOT_USERNAME}?startapp=ref_${user.referralCode}`;
    return ok(res, {
      referralCode: user.referralCode,
      link,
      appLink,
      shareText: `${user.firstName} приглашает тебя в FUNBOX — игры, друзья и награды в Telegram!`,
      rewards: { inviterCoins: 150, inviterXp: 80, invitedCoins: 100 },
    });
  }),
);

router.get(
  '/search',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const query = z
      .object({ q: z.string().trim().min(1).max(64), limit: z.coerce.number().min(1).max(20).default(10) })
      .parse(req.query);
    const blocked = await blockedUserIds(userId);

    const users = await prisma.user.findMany({
      where: {
        id: { notIn: [userId, ...blocked] },
        isBanned: false,
        OR: [
          { username: { contains: query.q, mode: 'insensitive' } },
          { firstName: { contains: query.q, mode: 'insensitive' } },
          { lastName: { contains: query.q, mode: 'insensitive' } },
        ],
      },
      select: userCardSelect,
      take: query.limit,
    });

    const [friends, requests] = await Promise.all([
      friendIds(userId),
      prisma.friendRequest.findMany({
        where: {
          status: 'PENDING',
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        select: { senderId: true, receiverId: true },
      }),
    ]);
    const requestMap = new Map(
      requests.map((r) => [
        r.senderId === userId ? r.receiverId : r.senderId,
        r.senderId === userId ? 'outgoing' : 'incoming',
      ]),
    );

    return ok(
      res,
      users.map((user) => ({
        ...user,
        relationship: friends.includes(user.id)
          ? 'friend'
          : (requestMap.get(user.id) ?? 'none'),
      })),
    );
  }),
);

router.post(
  '/request',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const senderId = req.auth!.id;
    const body = z
      .object({ userId: z.string().min(1), message: z.string().trim().max(300).optional() })
      .parse(req.body);
    if (body.userId === senderId) throw badRequest('Нельзя добавить себя в друзья');

    const target = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!target || target.isBanned) return notFound('Пользователь не найден');

    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: body.userId },
          { blockerId: body.userId, blockedId: senderId },
        ],
      },
    });
    if (blocked) throw badRequest('Пользователь недоступен');

    const [a, b] = canonical(senderId, body.userId);
    const friendship = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
    if (friendship) throw conflict('Вы уже друзья');

    const reverse = await prisma.friendRequest.findFirst({
      where: { senderId: body.userId, receiverId: senderId, status: 'PENDING' },
    });
    if (reverse) throw conflict('У вас уже есть входящая заявка от этого пользователя');

    const existing = await prisma.friendRequest.findUnique({
      where: { senderId_receiverId: { senderId, receiverId: body.userId } },
    });
    if (existing?.status === 'PENDING') throw conflict('Заявка уже отправлена');

    const request = existing
      ? await prisma.friendRequest.update({
          where: { id: existing.id },
          data: { status: 'PENDING', message: body.message, createdAt: new Date(), respondedAt: null },
        })
      : await prisma.friendRequest.create({
          data: { senderId, receiverId: body.userId, message: body.message },
        });

    await notifyUser({
      userId: body.userId,
      type: 'FRIEND_REQUEST',
      title: 'Новая заявка в друзья 👥',
      body: `${req.auth!.username ? '@' + req.auth!.username : 'Пользователь'} хочет добавить вас в друзья${body.message ? `: ${body.message}` : '.'}`,
      data: { requestId: request.id, senderId },
    });

    return ok(res, request, 201);
  }),
);

router.post(
  '/requests/:id/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const request = await prisma.friendRequest.findUnique({
      where: { id: req.params.id },
      include: { sender: { select: { firstName: true, username: true } } },
    });
    if (!request) return notFound('Заявка не найдена');
    if (request.receiverId !== userId) throw badRequest('Нет доступа к заявке');
    if (request.status !== 'PENDING') throw conflict('Заявка уже обработана');

    const [a, b] = canonical(request.senderId, request.receiverId);
    await prisma.$transaction([
      prisma.friendRequest.update({
        where: { id: request.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
      prisma.friendship.upsert({
        where: { userAId_userBId: { userAId: a, userBId: b } },
        update: {},
        create: { userAId: a, userBId: b },
      }),
    ]);

    await Promise.all([
      trackMetric(request.senderId, 'FRIENDS_ADDED', 1),
      trackMetric(request.receiverId, 'FRIENDS_ADDED', 1),
    ]);
    await notifyUser({
      userId: request.senderId,
      type: 'FRIEND_ACCEPTED',
      title: 'Заявка принята ✅',
      body: `${req.auth!.username ? '@' + req.auth!.username : 'Пользователь'} теперь ваш друг в FUNBOX.`,
      data: { friendId: userId },
    });
    return ok(res, { accepted: true });
  }),
);

router.post(
  '/requests/:id/decline',
  requireAuth,
  asyncHandler(async (req, res) => {
    const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return notFound('Заявка не найдена');
    if (request.receiverId !== req.auth!.id) throw badRequest('Нет доступа к заявке');
    await prisma.friendRequest.update({
      where: { id: request.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    return ok(res, { declined: true });
  }),
);

router.delete(
  '/requests/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return notFound('Заявка не найдена');
    if (request.senderId !== req.auth!.id) throw badRequest('Нет доступа к заявке');
    await prisma.friendRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    return ok(res, { cancelled: true });
  }),
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const [a, b] = canonical(userId, req.params.id);
    const friendship = await prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
    });
    if (!friendship) return notFound('Дружба не найдена');

    await prisma.friendship.delete({ where: { id: friendship.id } });
    await prisma.userStat.updateMany({
      where: { userId: { in: [userId, req.params.id] } },
      data: { friendsCount: { decrement: 1 } },
    });
    return ok(res, { removed: true });
  }),
);

export default router;
