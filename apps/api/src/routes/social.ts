import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { trackMetric } from '../services/progress.js';
import { notifyUser } from '../services/notifications.js';
import { blockedUserIds, userCardSelect } from '../services/users.js';
import { optionalImageUrlSchema } from '../lib/validation.js';

const router = Router();

const postInclude = (viewerId: string) => ({
  author: { select: userCardSelect },
  category: true,
  likes: { where: { userId: viewerId }, select: { id: true } },
  _count: { select: { comments: { where: { isDeleted: false } }, likes: true, reposts: true } },
  repostOf: {
    include: {
      author: { select: userCardSelect },
      category: true,
      _count: { select: { comments: { where: { isDeleted: false } }, likes: true } },
    },
  },
});

function presentPost<T extends { likes: { id: string }[]; _count: { comments: number; likes: number } }>(
  post: T,
) {
  const { likes, ...rest } = post;
  return { ...rest, likedByMe: likes.length > 0 };
}

router.get(
  '/feed',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const query = z
      .object({
        tab: z.enum(['latest', 'popular', 'friends', 'following', 'mine']).default('latest'),
        topic: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(30).default(12),
      })
      .parse(req.query);

    const blocked = await blockedUserIds(userId);
    const where: any = { isDeleted: false, authorId: { notIn: blocked } };

    if (query.tab === 'mine') {
      where.authorId = userId;
    } else if (query.tab === 'following') {
      const follows = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      where.authorId = { in: [...follows.map((follow) => follow.followingId), userId] };
    } else if (query.tab === 'friends') {
      const friendships = await prisma.friendship.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        select: { userAId: true, userBId: true },
      });
      where.authorId = {
        in: [...new Set(friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId))), userId],
      };
    }
    if (query.topic) where.category = { slug: query.topic };

    const [posts, total, topics] = await Promise.all([
      prisma.post.findMany({
        where,
        include: postInclude(userId),
        orderBy:
          query.tab === 'popular'
            ? [{ likeCount: 'desc' }, { commentCount: 'desc' }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.post.count({ where }),
      prisma.category.findMany({
        where: { type: 'POST', isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return ok(res, {
      posts: posts.map(presentPost),
      topics,
      pagination: { page: query.page, limit: query.limit, total, hasMore: query.page * query.limit < total },
    });
  }),
);

router.post(
  '/posts',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const body = z
      .object({
        content: z.string().trim().min(1, 'Напишите текст').max(2000),
        imageUrl: optionalImageUrlSchema,
        categoryId: z.string().optional().nullable(),
      })
      .parse(req.body);

    const recent = await prisma.post.count({
      where: { authorId: userId, createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    if (recent >= 5) throw badRequest('Слишком много публикаций. Подождите минуту.');

    if (body.categoryId) {
      const category = await prisma.category.findFirst({ where: { id: body.categoryId, type: 'POST' } });
      if (!category) throw badRequest('Тема не найдена');
    }

    const post = await prisma.post.create({
      data: {
        authorId: userId,
        content: body.content,
        imageUrl: body.imageUrl || null,
        categoryId: body.categoryId || null,
      },
      include: postInclude(userId),
    });
    await trackMetric(userId, 'POSTS_CREATED', 1);
    return ok(res, presentPost(post), 201);
  }),
);

router.delete(
  '/posts/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.isDeleted) return notFound('Публикация не найдена');
    if (post.authorId !== req.auth!.id && !['ADMIN', 'MODERATOR'].includes(req.auth!.role)) {
      throw forbidden('Можно удалять только свои публикации');
    }
    await prisma.post.update({ where: { id: post.id }, data: { isDeleted: true } });
    return ok(res, { deleted: true });
  }),
);

router.post(
  '/posts/:id/like',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.isDeleted) return notFound('Публикация не найдена');

    const existing = await prisma.like.findUnique({
      where: { postId_userId: { postId: post.id, userId } },
    });

    if (existing) {
      await prisma.$transaction([
        prisma.like.delete({ where: { id: existing.id } }),
        prisma.post.update({ where: { id: post.id }, data: { likeCount: { decrement: 1 } } }),
      ]);
      return ok(res, { liked: false, likeCount: Math.max(0, post.likeCount - 1) });
    }

    await prisma.$transaction([
      prisma.like.create({ data: { postId: post.id, userId } }),
      prisma.post.update({ where: { id: post.id }, data: { likeCount: { increment: 1 } } }),
    ]);
    await trackMetric(userId, 'LIKES_GIVEN', 1);
    if (post.authorId !== userId) {
      await trackMetric(post.authorId, 'LIKES_RECEIVED', 1);
    }
    return ok(res, { liked: true, likeCount: post.likeCount + 1 });
  }),
);

router.get(
  '/posts/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const comments = await prisma.comment.findMany({
      where: { postId: req.params.id, isDeleted: false },
      include: { author: { select: userCardSelect } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return ok(res, comments);
  }),
);

router.post(
  '/posts/:id/comments',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const body = z.object({ content: z.string().trim().min(1).max(600) }).parse(req.body);
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.isDeleted) return notFound('Публикация не найдена');

    const comment = await prisma.comment.create({
      data: { postId: post.id, authorId: userId, content: body.content },
      include: { author: { select: userCardSelect } },
    });
    await prisma.post.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } });
    await trackMetric(userId, 'COMMENTS_CREATED', 1);
    if (post.authorId !== userId) {
      await notifyUser({
        userId: post.authorId,
        type: 'SYSTEM',
        title: 'Новый комментарий 💬',
        body: `${req.auth!.username ?? 'Пользователь'} ответил на вашу публикацию: ${body.content.slice(0, 90)}`,
        data: { postId: post.id },
      });
    }
    return ok(res, comment, 201);
  }),
);

router.delete(
  '/comments/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment || comment.isDeleted) return notFound('Комментарий не найден');
    if (comment.authorId !== req.auth!.id && !['ADMIN', 'MODERATOR'].includes(req.auth!.role)) {
      throw forbidden();
    }
    await prisma.$transaction([
      prisma.comment.update({ where: { id: comment.id }, data: { isDeleted: true } }),
      prisma.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } }),
    ]);
    return ok(res, { deleted: true });
  }),
);

router.post(
  '/posts/:id/repost',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const body = z.object({ content: z.string().trim().max(1000).optional() }).parse(req.body ?? {});
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: { author: { select: { username: true, firstName: true } } },
    });
    if (!post || post.isDeleted) return notFound('Публикация не найдена');

    const existing = await prisma.post.findFirst({
      where: { repostOfId: post.id, authorId: userId, isDeleted: false },
    });
    if (existing) throw conflict('Вы уже поделились этой публикацией');

    const repost = await prisma.post.create({
      data: {
        authorId: userId,
        content:
          body.content?.trim() ||
          `Репост от ${post.author.username ? `@${post.author.username}` : post.author.firstName}`,
        repostOfId: post.id,
      },
      include: postInclude(userId),
    });
    await prisma.post.update({ where: { id: post.id }, data: { repostCount: { increment: 1 } } });
    await trackMetric(userId, 'POSTS_CREATED', 1);
    return ok(res, presentPost(repost), 201);
  }),
);

router.post(
  '/users/:id/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    const followerId = req.auth!.id;
    const followingId = req.params.id;
    if (followerId === followingId) throw badRequest('Нельзя подписаться на себя');
    const target = await prisma.user.findUnique({ where: { id: followingId } });
    if (!target || target.isBanned) return notFound('Пользователь не найден');
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: followerId, blockedId: followingId },
          { blockerId: followingId, blockedId: followerId },
        ],
      },
    });
    if (blocked) throw badRequest('Пользователь недоступен');

    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      update: {},
      create: { followerId, followingId },
    });
    return ok(res, { following: true });
  }),
);

router.delete(
  '/users/:id/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.follow.deleteMany({
      where: { followerId: req.auth!.id, followingId: req.params.id },
    });
    return ok(res, { following: false });
  }),
);

router.get(
  '/following',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.follow.findMany({
      where: { followerId: req.auth!.id },
      include: { following: { select: userCardSelect } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, rows.map((row) => row.following));
  }),
);

router.get(
  '/followers',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.follow.findMany({
      where: { followingId: req.auth!.id },
      include: { follower: { select: userCardSelect } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, rows.map((row) => row.follower));
  }),
);

router.post(
  '/reports',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const body = z
      .object({
        targetPostId: z.string().optional(),
        reportedUserId: z.string().optional(),
        reason: z.enum(['SPAM', 'ABUSE', 'ADULT', 'VIOLENCE', 'SCAM', 'OTHER']),
        details: z.string().trim().max(700).optional(),
      })
      .refine((data) => data.targetPostId || data.reportedUserId, 'Укажите объект жалобы')
      .parse(req.body);

    const existing = await prisma.report.findFirst({
      where: {
        reporterId: userId,
        status: 'PENDING',
        targetPostId: body.targetPostId ?? null,
        reportedUserId: body.reportedUserId ?? null,
      },
    });
    if (existing) throw conflict('Жалоба уже отправлена и рассматривается');

    const report = await prisma.report.create({
      data: {
        reporterId: userId,
        targetPostId: body.targetPostId,
        reportedUserId: body.reportedUserId,
        reason: body.reason,
        details: body.details,
      },
    });
    return ok(res, report, 201);
  }),
);

router.post(
  '/users/:id/block',
  requireAuth,
  asyncHandler(async (req, res) => {
    const blockerId = req.auth!.id;
    const blockedId = req.params.id;
    if (blockerId === blockedId) throw badRequest('Нельзя заблокировать себя');

    const user = await prisma.user.findUnique({ where: { id: blockedId } });
    if (!user) return notFound('Пользователь не найден');

    const [a, b] = [blockerId, blockedId].sort();
    await prisma.$transaction([
      prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        update: {},
        create: { blockerId, blockedId },
      }),
      prisma.friendship.deleteMany({
        where: {
          OR: [
            { userAId: a, userBId: b },
            { userAId: b, userBId: a },
          ],
        },
      }),
      prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: blockerId, receiverId: blockedId },
            { senderId: blockedId, receiverId: blockerId },
          ],
          status: 'PENDING',
        },
      }),
    ]);
    return ok(res, { blocked: true });
  }),
);

router.delete(
  '/users/:id/block',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.block.deleteMany({
      where: { blockerId: req.auth!.id, blockedId: req.params.id },
    });
    return ok(res, { blocked: false });
  }),
);

export default router;
