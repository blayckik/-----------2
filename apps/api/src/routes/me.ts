import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { trackMetric, levelProgress } from '../services/progress.js';
import { friendIds, userCardSelect } from '../services/users.js';

const router = Router();

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(64).optional(),
  lastName: z.string().trim().max(64).nullable().optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'Только латиница, цифры и _')
    .nullable()
    .optional(),
  displayName: z.string().trim().max(48).nullable().optional(),
  bio: z.string().trim().max(280).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  bannerUrl: z.string().max(500).nullable().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  country: z.string().trim().max(48).nullable().optional(),
  hideFriends: z.boolean().optional(),
  hideActivity: z.boolean().optional(),
  allowStrangersMessages: z.boolean().optional(),
  allowGameInvites: z.boolean().optional(),
});

router.patch(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const body = profileSchema.parse(req.body);
    const currentProfile = await prisma.userProfile.findUnique({ where: { userId } });

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        username: body.username,
        profile: {
          upsert: {
            create: {
              displayName: body.displayName,
              bio: body.bio,
              bannerUrl: body.bannerUrl,
              accentColor: body.accentColor ?? '#8b5cf6',
              country: body.country,
              hideFriends: body.hideFriends ?? false,
              hideActivity: body.hideActivity ?? false,
              allowStrangersMessages: body.allowStrangersMessages ?? true,
              allowGameInvites: body.allowGameInvites ?? true,
            },
            update: {
              displayName: body.displayName,
              bio: body.bio,
              bannerUrl: body.bannerUrl,
              accentColor: body.accentColor,
              country: body.country,
              hideFriends: body.hideFriends,
              hideActivity: body.hideActivity,
              allowStrangersMessages: body.allowStrangersMessages,
              allowGameInvites: body.allowGameInvites,
            },
          },
        },
      },
      include: { profile: true },
    });

    if (body.avatarUrl !== undefined) {
      await prisma.user.update({ where: { id: userId }, data: { avatarUrl: body.avatarUrl } });
    }

    const completed =
      Boolean((body.bio ?? currentProfile?.bio)?.trim()) &&
      Boolean((body.displayName ?? currentProfile?.displayName)?.trim()) &&
      Boolean((body.accentColor ?? currentProfile?.accentColor) || body.avatarUrl !== undefined);

    if (completed && !currentProfile?.profileCompleted) {
      await prisma.userProfile.update({
        where: { userId },
        data: { profileCompleted: true },
      });
      await trackMetric(userId, 'PROFILE_COMPLETED', 1);
    }

    return ok(res, user);
  }),
);

const settingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).optional(),
  language: z.enum(['ru', 'en']).optional(),
  notifyFriends: z.boolean().optional(),
  notifyMessages: z.boolean().optional(),
  notifyAchievements: z.boolean().optional(),
  notifyDaily: z.boolean().optional(),
  notifyGameInvites: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
});

router.patch(
  '/settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = settingsSchema.parse(req.body);
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.auth!.id },
      update: body,
      create: { userId: req.auth!.id, ...body },
    });
    return ok(res, settings);
  }),
);

router.delete(
  '/account',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z.object({ confirm: z.literal('УДАЛИТЬ') }).parse(req.body);
    if (body.confirm !== 'УДАЛИТЬ') return notFound();
    await prisma.user.update({
      where: { id: req.auth!.id },
      data: {
        isBanned: true,
        banReason: 'Удалён по запросу пользователя',
        username: null,
        avatarUrl: null,
      },
    });
    return ok(res, { deleted: true });
  }),
);

router.get(
  '/activity',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.activityLog.findMany({
      where: { userId: req.auth!.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return ok(res, rows);
  }),
);

router.get(
  '/friends',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ids = await friendIds(req.auth!.id);
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: userCardSelect,
      orderBy: { lastActiveAt: 'desc' },
    });
    return ok(res, users);
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewerId = req.auth!.id;
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        profile: true,
        stats: true,
        achievements: {
          include: { achievement: true },
          orderBy: { unlockedAt: 'desc' },
          take: 24,
        },
        posts: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 12,
          include: { _count: { select: { comments: true, likes: true } } },
        },
      },
    });
    if (!user) return notFound('Пользователь не найден');
    if (user.isBanned && viewerId !== user.id) return notFound('Пользователь недоступен');

    const [friendship, request, block, follow, followersCount, followingCount, friends, activity] = await Promise.all([
      prisma.friendship.findFirst({
        where: {
          OR: [
            { userAId: viewerId, userBId: user.id },
            { userAId: user.id, userBId: viewerId },
          ],
        },
      }),
      prisma.friendRequest.findFirst({
        where: {
          OR: [
            { senderId: viewerId, receiverId: user.id, status: 'PENDING' },
            { senderId: user.id, receiverId: viewerId, status: 'PENDING' },
          ],
        },
      }),
      prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: viewerId, blockedId: user.id } },
      }),
      prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
      }),
      prisma.follow.count({ where: { followingId: user.id } }),
      prisma.follow.count({ where: { followerId: user.id } }),
      user.profile?.hideFriends && viewerId !== user.id
        ? Promise.resolve([])
        : prisma.user.findMany({
            where: {
              OR: [{ friendshipsAsA: { some: { userBId: user.id } } }, { friendshipsAsB: { some: { userAId: user.id } } }],
            },
            select: userCardSelect,
            take: 12,
          }),
      user.profile?.hideActivity && viewerId !== user.id
        ? Promise.resolve([])
        : prisma.activityLog.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 12,
          }),
    ]);

    return ok(res, {
      ...user,
      xp: user.xp,
      levelProgress: levelProgress(user.xp),
      relationship: {
        isSelf: viewerId === user.id,
        isFriend: Boolean(friendship),
        requestStatus: request?.status ?? null,
        requestDirection: request ? (request.senderId === viewerId ? 'outgoing' : 'incoming') : null,
        isBlocked: Boolean(block),
        isFollowing: Boolean(follow),
      },
      followersCount,
      followingCount,
      friends,
      activity,
    });
  }),
);

export default router;
