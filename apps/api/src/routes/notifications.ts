import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.auth!.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.notification.count({ where: { userId: req.auth!.id, readAt: null } }),
    ]);
    return ok(res, { notifications, unread, page });
  }),
);

router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== req.auth!.id) return notFound();
    await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
    return ok(res, { read: true });
  }),
);

router.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.auth!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok(res, { updated: result.count });
  }),
);

export default router;
