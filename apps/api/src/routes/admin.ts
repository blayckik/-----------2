import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound, ok } from '../lib/http.js';
import { requireAuth, requireModerator, requireAdmin } from '../middleware/auth.js';
import { userCardSelect } from '../services/users.js';
import { levelFromXp } from '../services/progress.js';
import { getIO } from '../lib/io.js';
import { optionalImageUrlSchema } from '../lib/validation.js';

const router = Router();
router.use(requireAuth);

/**
 * Иерархия модерации: ADMIN может управлять модераторами, MODERATOR — только
 * обычными пользователями. Администратора нельзя заблокировать через панель.
 */
function canModerateRole(actor: 'USER' | 'MODERATOR' | 'ADMIN', target: 'USER' | 'MODERATOR' | 'ADMIN') {
  if (target === 'ADMIN') return false;
  if (target === 'MODERATOR') return actor === 'ADMIN';
  return true;
}

router.get(
  '/stats',
  requireModerator,
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [
      users,
      newUsers,
      activeToday,
      posts,
      messages,
      gamesPlayed,
      activeRooms,
      pendingReports,
      coinsSupply,
      achievementsUnlocked,
      transactions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { lastActiveAt: { gte: dayAgo } } }),
      prisma.post.count({ where: { isDeleted: false } }),
      prisma.message.count({ where: { isDeleted: false } }),
      prisma.gameResult.count(),
      prisma.gameRoom.count({ where: { status: 'PLAYING' } }),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.user.aggregate({ _sum: { coins: true } }),
      prisma.userAchievement.count(),
      prisma.transaction.count(),
    ]);

    const days = Array.from({ length: 7 }, (_, index) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (6 - index));
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end, label: start.toISOString().slice(5, 10) };
    });

    const chart = await Promise.all(
      days.map(async (day) => ({
        label: day.label,
        users: await prisma.user.count({ where: { createdAt: { gte: day.start, lt: day.end } } }),
        games: await prisma.gameResult.count({ where: { createdAt: { gte: day.start, lt: day.end } } }),
        posts: await prisma.post.count({
          where: { createdAt: { gte: day.start, lt: day.end }, isDeleted: false },
        }),
      })),
    );

    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { ...userCardSelect, isBanned: true, coins: true },
    });

    return ok(res, {
      users,
      newUsers,
      activeToday,
      posts,
      messages,
      gamesPlayed,
      activeRooms,
      pendingReports,
      coinsSupply: coinsSupply._sum.coins ?? 0,
      achievementsUnlocked,
      transactions,
      chart,
      recentUsers,
    });
  }),
);

router.get(
  '/users',
  requireModerator,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        q: z.string().trim().max(64).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        filter: z.enum(['all', 'banned', 'admins', 'active']).default('all'),
      })
      .parse(req.query);

    const where: Prisma.UserWhereInput = {};
    if (query.q) {
      where.OR = [
        { username: { contains: query.q, mode: 'insensitive' } },
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { telegramId: { contains: query.q } },
      ];
    }
    if (query.filter === 'banned') where.isBanned = true;
    if (query.filter === 'admins') where.role = { in: ['ADMIN', 'MODERATOR'] };
    if (query.filter === 'active') where.lastActiveAt = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          ...userCardSelect,
          telegramId: true,
          coins: true,
          isBanned: true,
          banReason: true,
          role: true,
          level: true,
          xp: true,
          lastActiveAt: true,
          createdAt: true,
          stats: true,
          profile: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);
    return ok(res, { users, total, page: query.page, pages: Math.ceil(total / query.limit) });
  }),
);

router.post(
  '/users/:id/ban',
  requireModerator,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ banned: z.boolean(), reason: z.string().trim().max(300).optional() })
      .parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return notFound('Пользователь не найден');
    if (target.id === req.auth!.id) throw badRequest('Нельзя заблокировать себя');
    if (!canModerateRole(req.auth!.role, target.role)) {
      throw forbidden('Недостаточно прав для блокировки этой роли');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: {
          isBanned: body.banned,
          banReason: body.banned ? body.reason ?? 'Нарушение правил' : null,
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: req.auth!.id,
          action: body.banned ? 'admin.user.ban' : 'admin.user.unban',
          metadata: { targetUserId: target.id, reason: body.reason },
        },
      }),
    ]);
    if (body.banned) {
      getIO()?.in(`user:${target.id}`).disconnectSockets(true);
    }
    return ok(res, { banned: body.banned });
  }),
);

router.patch(
  '/users/:id/role',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z.object({ role: z.enum(['USER', 'MODERATOR', 'ADMIN']) }).parse(req.body);
    if (req.params.id === req.auth!.id) throw badRequest('Нельзя изменить собственную роль');
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return notFound('Пользователь не найден');
    if (target.role === 'ADMIN' && body.role !== 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', isBanned: false } });
      if (admins <= 1) throw badRequest('Нельзя снять роль с последнего администратора');
    }
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { role: body.role },
      select: { id: true, role: true },
    });
    await prisma.activityLog.create({
      data: {
        userId: req.auth!.id,
        action: 'admin.user.role',
        metadata: { targetUserId: target.id, role: body.role },
      },
    });
    return ok(res, user);
  }),
);

router.patch(
  '/users/:id/profile',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        firstName: z.string().trim().min(1).max(64).optional(),
        lastName: z.string().trim().max(64).nullable().optional(),
        username: z
          .string()
          .trim()
          .min(3)
          .max(32)
          .regex(/^[a-zA-Z0-9_]+$/)
          .nullable()
          .optional(),
        avatarUrl: optionalImageUrlSchema,
        bio: z.string().trim().max(300).nullable().optional(),
        displayName: z.string().trim().max(64).nullable().optional(),
        accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        bannerUrl: optionalImageUrlSchema,
        country: z.string().trim().max(64).nullable().optional(),
        level: z.number().int().min(1).max(999).optional(),
        xp: z.number().int().min(0).max(100_000_000).optional(),
        coins: z.number().int().min(0).max(100_000_000).optional(),
        role: z.enum(['USER', 'MODERATOR', 'ADMIN']).optional(),
        isBanned: z.boolean().optional(),
        banReason: z.string().trim().max(300).nullable().optional(),
        hideFriends: z.boolean().optional(),
        hideActivity: z.boolean().optional(),
        allowStrangersMessages: z.boolean().optional(),
        allowGameInvites: z.boolean().optional(),
        stats: z
          .object({
            gamesPlayed: z.number().int().min(0).max(1_000_000).optional(),
            gamesWon: z.number().int().min(0).max(1_000_000).optional(),
            quizWins: z.number().int().min(0).max(1_000_000).optional(),
            friendsCount: z.number().int().min(0).max(1_000_000).optional(),
            postsCount: z.number().int().min(0).max(1_000_000).optional(),
            likesReceived: z.number().int().min(0).max(1_000_000).optional(),
            messagesSent: z.number().int().min(0).max(1_000_000).optional(),
            wordsSubmitted: z.number().int().min(0).max(1_000_000).optional(),
            imagesGuessed: z.number().int().min(0).max(1_000_000).optional(),
            wyrVotes: z.number().int().min(0).max(1_000_000).optional(),
            loginStreak: z.number().int().min(0).max(10_000).optional(),
            xpEarned: z.number().int().min(0).max(100_000_000).optional(),
            coinsEarned: z.number().int().min(0).max(100_000_000).optional(),
          })
          .optional(),
      })
      .parse(req.body);

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return notFound('Пользователь не найден');
    if (body.role && target.id === req.auth!.id && body.role !== target.role) {
      throw badRequest('Нельзя изменить собственную роль');
    }
    if (body.role && target.role === 'ADMIN' && body.role !== 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', isBanned: false } });
      if (admins <= 1) throw badRequest('Нельзя снять роль с последнего администратора');
    }
    if (body.username && body.username !== target.username) {
      const exists = await prisma.user.findUnique({ where: { username: body.username } });
      if (exists) throw badRequest('Этот username уже занят');
    }

    const nextXp = body.xp ?? target.xp;
    const nextLevel = body.level ?? levelFromXp(nextXp);
    const data: Prisma.UserUpdateInput = {};
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.username !== undefined) data.username = body.username;
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
    if (body.coins !== undefined) data.coins = body.coins;
    if (body.role !== undefined) data.role = body.role;
    if (body.isBanned !== undefined) data.isBanned = body.isBanned;
    if (body.banReason !== undefined) data.banReason = body.banReason;
    if (body.xp !== undefined || body.level !== undefined) {
      data.xp = nextXp;
      data.level = nextLevel;
    }
    data.profile = {
      upsert: {
        create: {
          displayName: body.displayName ?? null,
          bio: body.bio ?? null,
          accentColor: body.accentColor ?? '#8b5cf6',
          bannerUrl: body.bannerUrl ?? null,
          country: body.country ?? null,
          hideFriends: body.hideFriends ?? false,
          hideActivity: body.hideActivity ?? false,
          allowStrangersMessages: body.allowStrangersMessages ?? true,
          allowGameInvites: body.allowGameInvites ?? true,
        },
        update: {
          displayName: body.displayName,
          bio: body.bio,
          accentColor: body.accentColor,
          bannerUrl: body.bannerUrl,
          country: body.country,
          hideFriends: body.hideFriends,
          hideActivity: body.hideActivity,
          allowStrangersMessages: body.allowStrangersMessages,
          allowGameInvites: body.allowGameInvites,
        },
      },
    };

    const user = await prisma.user.update({
      where: { id: target.id },
      data,
      include: { profile: true, stats: true },
    });

    if (body.stats) {
      await prisma.userStat.upsert({
        where: { userId: target.id },
        create: { userId: target.id, ...body.stats },
        update: body.stats,
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: req.auth!.id,
        action: 'admin.user.profile',
        metadata: {
          targetUserId: target.id,
          fields: Object.keys(body),
        },
      },
    });

    return ok(res, user);
  }),
);

router.get(
  '/users/:id/rewards',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [user, achievements, purchases] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, xp: true, level: true, coins: true },
      }),
      prisma.userAchievement.findMany({
        where: { userId: req.params.id },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
      }),
      prisma.purchase.findMany({
        where: { userId: req.params.id },
        include: { item: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!user) return notFound('Пользователь не найден');
    return ok(res, { user, achievements, purchases });
  }),
);

router.post(
  '/users/:id/achievements',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z.object({ achievementId: z.string(), grant: z.boolean() }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return notFound('Пользователь не найден');
    if (body.grant) {
      await prisma.userAchievement.upsert({
        where: { userId_achievementId: { userId: target.id, achievementId: body.achievementId } },
        update: {},
        create: { userId: target.id, achievementId: body.achievementId },
      });
    } else {
      await prisma.userAchievement.deleteMany({
        where: { userId: target.id, achievementId: body.achievementId },
      });
    }
    return ok(res, { updated: true });
  }),
);

router.post(
  '/users/:id/purchases',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z.object({ itemId: z.string(), grant: z.boolean() }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return notFound('Пользователь не найден');
    if (body.grant) {
      await prisma.purchase.upsert({
        where: { userId_itemId: { userId: target.id, itemId: body.itemId } },
        update: {},
        create: { userId: target.id, itemId: body.itemId, price: 0 },
      });
    } else {
      await prisma.purchase.deleteMany({ where: { userId: target.id, itemId: body.itemId } });
    }
    return ok(res, { updated: true });
  }),
);

router.post(
  '/users/:id/reset',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z.object({ confirm: z.literal(true) }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return notFound('Пользователь не найден');
    if (target.role === 'ADMIN' && target.id !== req.auth!.id) {
      throw badRequest('Нельзя сбрасывать профиль другого администратора');
    }
    await prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.userAchievement.deleteMany({ where: { userId: target.id } }),
        tx.purchase.deleteMany({ where: { userId: target.id } }),
        tx.gameResult.deleteMany({ where: { userId: target.id } }),
        tx.transaction.deleteMany({ where: { userId: target.id } }),
        tx.userStat.deleteMany({ where: { userId: target.id } }),
      ]);
      await tx.user.update({
        where: { id: target.id },
        data: { xp: 0, level: 1, coins: 0 },
      });
      await tx.wallet.upsert({
        where: { userId: target.id },
        update: { totalEarned: 0, totalSpent: 0 },
        create: { userId: target.id },
      });
    });
    return ok(res, { reset: true });
  }),
);

router.post(
  '/users/:id/balance',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ amount: z.number().int().min(-1_000_000).max(1_000_000), reason: z.string().trim().min(2).max(200) })
      .parse(req.body);
    if (body.amount === 0) throw badRequest('Сумма не может быть нулевой');
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return notFound('Пользователь не найден');
    if (body.amount < 0 && target.coins + body.amount < 0) throw badRequest('Баланс не может стать отрицательным');

    const reference = `admin:${randomUUID()}`;
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: { coins: { increment: body.amount } },
        select: { coins: true },
      });
      await tx.transaction.create({
        data: {
          userId: target.id,
          amount: body.amount,
          type: 'ADMIN',
          description: body.reason,
          reference,
          metadata: { adminId: req.auth!.id },
        },
      });
      await tx.wallet.upsert({
        where: { userId: target.id },
        update: {
          totalEarned: { increment: Math.max(0, body.amount) },
          totalSpent: { increment: Math.max(0, -body.amount) },
        },
        create: {
          userId: target.id,
          totalEarned: Math.max(0, body.amount),
          totalSpent: Math.max(0, -body.amount),
        },
      });
      await tx.notification.create({
        data: {
          userId: target.id,
          type: 'REWARD',
          title: 'Изменение баланса',
          body: `${body.amount > 0 ? '+' : ''}${body.amount} FUN Coins · ${body.reason}`,
        },
      });
      return user;
    });
    return ok(res, updated);
  }),
);

router.get(
  '/posts',
  requireModerator,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        q: z.string().trim().max(64).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);
    const where: Prisma.PostWhereInput = {
      ...(query.q ? { content: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          author: { select: userCardSelect },
          _count: { select: { likes: true, comments: true, reports: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.post.count({ where }),
    ]);
    return ok(res, { posts, total, page: query.page, pages: Math.ceil(total / query.limit) });
  }),
);

router.delete(
  '/posts/:id',
  requireModerator,
  asyncHandler(async (req, res) => {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return notFound('Публикация не найдена');
    await prisma.post.update({ where: { id: post.id }, data: { isDeleted: true } });
    await prisma.activityLog.create({
      data: {
        userId: req.auth!.id,
        action: 'admin.post.delete',
        metadata: { postId: post.id, authorId: post.authorId },
      },
    });
    return ok(res, { deleted: true });
  }),
);

router.get(
  '/reports',
  requireModerator,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        status: z.enum(['PENDING', 'RESOLVED', 'DISMISSED', 'ALL']).default('PENDING'),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const where: Prisma.ReportWhereInput = query.status === 'ALL' ? {} : { status: query.status };
    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: { select: userCardSelect },
          reportedUser: { select: userCardSelect },
          targetPost: {
            include: { author: { select: userCardSelect } },
          },
          resolver: { select: userCardSelect },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * 20,
        take: 20,
      }),
      prisma.report.count({ where }),
    ]);
    return ok(res, { reports, total, page: query.page });
  }),
);

router.post(
  '/reports/:id/resolve',
  requireModerator,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['RESOLVED', 'DISMISSED']),
        note: z.string().trim().max(500).optional(),
        action: z.enum(['none', 'deletePost', 'banUser']).default('none'),
      })
      .parse(req.body);
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: { reportedUser: { select: { id: true, role: true, isBanned: true } } },
    });
    if (!report) return notFound('Жалоба не найдена');
    if (report.status !== 'PENDING') throw badRequest('Жалоба уже обработана');
    if (body.action === 'banUser') {
      if (!report.reportedUser) throw badRequest('В жалобе не указан пользователь для блокировки');
      if (!canModerateRole(req.auth!.role, report.reportedUser.role)) {
        throw forbidden('Недостаточно прав для блокировки этой роли');
      }
      if (report.reportedUser.isBanned) throw badRequest('Пользователь уже заблокирован');
    }

    await prisma.$transaction(async (tx) => {
      if (body.action === 'deletePost' && report.targetPostId) {
        await tx.post.update({ where: { id: report.targetPostId }, data: { isDeleted: true } });
      }
      if (body.action === 'banUser' && report.reportedUserId) {
        await tx.user.update({
          where: { id: report.reportedUserId },
          data: { isBanned: true, banReason: body.note ?? report.reason },
        });
      }
      await tx.report.update({
        where: { id: report.id },
        data: {
          status: body.status,
          resolutionNote: body.note,
          resolverId: req.auth!.id,
          resolvedAt: new Date(),
        },
      });
      await tx.activityLog.create({
        data: {
          userId: req.auth!.id,
          action: 'admin.report.resolve',
          metadata: { reportId: report.id, action: body.action, status: body.status },
        },
      });
    });
    return ok(res, { resolved: true });
  }),
);

// ── Content management ─────────────────────────────────────

router.get(
  '/questions',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        q: z.string().trim().max(64).optional(),
        game: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const where: Prisma.GameQuestionWhereInput = {
      ...(query.q ? { prompt: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.game ? { game: { slug: query.game } } : {}),
    };
    const [questions, total] = await Promise.all([
      prisma.gameQuestion.findMany({
        where,
        include: { game: true, category: true, author: { select: userCardSelect } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * 25,
        take: 25,
      }),
      prisma.gameQuestion.count({ where }),
    ]);
    return ok(res, { questions, total, page: query.page, pages: Math.ceil(total / 25) });
  }),
);

const questionSchema = z.object({
  gameId: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  prompt: z.string().trim().min(3).max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  correctOption: z.number().int().min(0).max(5).nullable().optional(),
  answerText: z.string().trim().max(120).nullable().optional(),
  hint: z.string().trim().max(300).nullable().optional(),
  mediaUrl: optionalImageUrlSchema,
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  isActive: z.boolean().default(true),
  isApproved: z.boolean().default(true),
});

router.post(
  '/questions',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = questionSchema.parse(req.body);
    const question = await prisma.gameQuestion.create({
      data: {
        gameId: body.gameId,
        categoryId: body.categoryId,
        prompt: body.prompt,
        options: body.options as Prisma.InputJsonValue,
        correctOption: body.correctOption,
        answerText: body.answerText,
        hint: body.hint,
        mediaUrl: body.mediaUrl,
        difficulty: body.difficulty,
        isActive: body.isActive,
        isApproved: body.isApproved,
        authorId: req.auth!.id,
      },
    });
    return ok(res, question, 201);
  }),
);

router.patch(
  '/questions/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = questionSchema.partial().parse(req.body);
    const question = await prisma.gameQuestion.update({
      where: { id: req.params.id },
      data: {
        ...body,
        options: body.options as Prisma.InputJsonValue | undefined,
      },
    });
    return ok(res, question);
  }),
);

router.delete(
  '/questions/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.gameQuestion.update({ where: { id: req.params.id }, data: { isActive: false } });
    return ok(res, { deleted: true });
  }),
);

router.get(
  '/categories',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { questions: true, posts: true, rooms: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return ok(res, categories);
  }),
);

const categorySchema = z.object({
  name: z.string().trim().min(2).max(48),
  slug: z.string().trim().min(2).max(48).regex(/^[a-z0-9-]+$/),
  icon: z.string().max(32).optional().nullable(),
  type: z.enum(['GAME', 'QUIZ', 'POST', 'SHOP']).default('QUIZ'),
  isActive: z.boolean().default(true),
});

router.post(
  '/categories',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = categorySchema.parse(req.body);
    const category = await prisma.category.create({ data: body });
    return ok(res, category, 201);
  }),
);

router.patch(
  '/categories/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = categorySchema.partial().parse(req.body);
    const category = await prisma.category.update({ where: { id: req.params.id }, data: body });
    return ok(res, category);
  }),
);

router.delete(
  '/categories/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.category.update({ where: { id: req.params.id }, data: { isActive: false } });
    return ok(res, { deleted: true });
  }),
);

router.get(
  '/quests',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const quests = await prisma.quest.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: [{ period: 'asc' }, { sortOrder: 'asc' }],
    });
    return ok(res, quests);
  }),
);

const questSchema = z.object({
  code: z.string().trim().min(2).max(48).regex(/^[a-z0-9_-]+$/),
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(300),
  icon: z.string().max(32).default('🎯'),
  period: z.enum(['ONBOARDING', 'DAILY', 'WEEKLY', 'SPECIAL']),
  metric: z.enum([
    'GAMES_PLAYED',
    'GAMES_WON',
    'QUIZ_WINS',
    'FRIENDS_ADDED',
    'POSTS_CREATED',
    'COMMENTS_CREATED',
    'LIKES_GIVEN',
    'LIKES_RECEIVED',
    'MESSAGES_SENT',
    'LOGIN_STREAK',
    'REFERRALS',
    'XP_EARNED',
    'COINS_EARNED',
    'IMAGES_GUESSED',
    'WORDS_SUBMITTED',
    'WYR_VOTES',
    'PROFILE_COMPLETED',
  ]),
  target: z.number().int().min(1).max(100000),
  xpReward: z.number().int().min(0).max(100000).default(0),
  coinReward: z.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

router.post(
  '/quests',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const quest = await prisma.quest.create({ data: questSchema.parse(req.body) });
    return ok(res, quest, 201);
  }),
);

router.patch(
  '/quests/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const quest = await prisma.quest.update({
      where: { id: req.params.id },
      data: questSchema.partial().parse(req.body),
    });
    return ok(res, quest);
  }),
);

router.delete(
  '/quests/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.quest.update({ where: { id: req.params.id }, data: { isActive: false } });
    return ok(res, { deleted: true });
  }),
);

router.get(
  '/achievements',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const achievements = await prisma.achievement.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: [{ rarity: 'asc' }, { threshold: 'asc' }],
    });
    return ok(res, achievements);
  }),
);

const achievementSchema = z.object({
  code: z.string().trim().min(2).max(48).regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(300),
  icon: z.string().max(32).default('🏆'),
  rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']).default('COMMON'),
  metric: z.string().nullable().optional(),
  threshold: z.number().int().min(1).max(1000000).default(1),
  xpReward: z.number().int().min(0).max(100000).default(0),
  coinReward: z.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
});

router.post(
  '/achievements',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = achievementSchema.parse(req.body);
    const achievement = await prisma.achievement.create({
      data: { ...body, metric: (body.metric as never) || null },
    });
    return ok(res, achievement, 201);
  }),
);

router.patch(
  '/achievements/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = achievementSchema.partial().parse(req.body);
    const achievement = await prisma.achievement.update({
      where: { id: req.params.id },
      data: { ...body, metric: body.metric === undefined ? undefined : ((body.metric as never) || null) },
    });
    return ok(res, achievement);
  }),
);

router.delete(
  '/achievements/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.achievement.update({ where: { id: req.params.id }, data: { isActive: false } });
    return ok(res, { deleted: true });
  }),
);

router.get(
  '/events',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const events = await prisma.platformEvent.findMany({ orderBy: { startsAt: 'desc' } });
    return ok(res, events);
  }),
);

router.post(
  '/events',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(2).max(100),
        description: z.string().trim().min(2).max(500),
        icon: z.string().max(32).default('✨'),
        gradient: z.string().max(200).default('linear-gradient(135deg,#8b5cf6,#ec4899)'),
        rewardXp: z.number().int().min(0).default(0),
        rewardCoins: z.number().int().min(0).default(0),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        isActive: z.boolean().default(true),
      })
      .parse(req.body);
    const event = await prisma.platformEvent.create({ data: body });
    return ok(res, event, 201);
  }),
);

router.delete(
  '/events/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.platformEvent.update({ where: { id: req.params.id }, data: { isActive: false } });
    return ok(res, { deleted: true });
  }),
);

router.get(
  '/transactions',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = z
      .object({ page: z.coerce.number().int().min(1).default(1), type: z.string().optional() })
      .parse(req.query);
    const where: Prisma.TransactionWhereInput = query.type
      ? { type: query.type as Prisma.EnumTransactionTypeFilter['equals'] }
      : {};
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { user: { select: userCardSelect } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * 25,
        take: 25,
      }),
      prisma.transaction.count({ where }),
    ]);
    return ok(res, { transactions, total, page: query.page });
  }),
);

router.get(
  '/activity',
  requireModerator,
  asyncHandler(async (req, res) => {
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
    const [activity, total] = await Promise.all([
      prisma.activityLog.findMany({
        include: { user: { select: userCardSelect } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 30,
        take: 30,
      }),
      prisma.activityLog.count(),
    ]);
    return ok(res, { activity, total, page });
  }),
);

router.get(
  '/shop',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const items = await prisma.shopItem.findMany({
      include: { _count: { select: { purchases: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return ok(res, items);
  }),
);

router.post(
  '/shop',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        code: z.string().min(2).max(48).regex(/^[a-z0-9_-]+$/),
        name: z.string().min(2).max(80),
        description: z.string().min(2).max(300),
        icon: z.string().max(32),
        type: z.enum(['AVATAR', 'BADGE', 'THEME', 'BOOST', 'TITLE', 'STICKER']),
        price: z.number().int().min(1),
        rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']).default('COMMON'),
        payload: z.record(z.unknown()).optional(),
        isActive: z.boolean().default(true),
      })
      .parse(req.body);
    const item = await prisma.shopItem.create({
      data: { ...body, payload: body.payload as Prisma.InputJsonValue | undefined },
    });
    return ok(res, item, 201);
  }),
);

router.post(
  '/recalculate-levels',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ select: { id: true, xp: true, level: true } });
    let updated = 0;
    for (const user of users) {
      const level = levelFromXp(user.xp);
      if (level !== user.level) {
        await prisma.user.update({ where: { id: user.id }, data: { level } });
        updated += 1;
      }
    }
    return ok(res, { updated, checked: users.length });
  }),
);

export default router;
