import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { blockedUserIds, userCardSelect } from '../services/users.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = z.object({ q: z.string().trim().min(2).max(64) }).parse(req.query);
    const blocked = await blockedUserIds(req.auth!.id);
    const term = query.q;

    const [users, posts, games, topics] = await Promise.all([
      prisma.user.findMany({
        where: {
          id: { notIn: [req.auth!.id, ...blocked] },
          isBanned: false,
          OR: [
            { username: { contains: term, mode: 'insensitive' } },
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: userCardSelect,
        take: 6,
      }),
      prisma.post.findMany({
        where: {
          isDeleted: false,
          authorId: { notIn: blocked },
          content: { contains: term, mode: 'insensitive' },
        },
        include: {
          author: { select: userCardSelect },
          _count: { select: { comments: true, likes: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.game.findMany({
        where: {
          isActive: true,
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 4,
      }),
      prisma.category.findMany({
        where: { isActive: true, name: { contains: term, mode: 'insensitive' } },
        take: 5,
      }),
    ]);

    return ok(res, { users, posts, games, topics });
  }),
);

export default router;
