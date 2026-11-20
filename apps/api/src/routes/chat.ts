import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { assertParticipant, findOrCreateDirectConversation, sendChatMessage } from '../services/chat.js';
import { userCardSelect } from '../services/users.js';
import { emitToUser } from '../lib/io.js';
import { optionalImageUrlSchema } from '../lib/validation.js';

const router = Router();

router.get(
  '/conversations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: {
          include: { user: { select: userCardSelect } },
        },
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: userCardSelect } },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 60,
    });

    const ids = conversations.map((conversation) => conversation.id);
    const unreadGroups = ids.length
      ? await prisma.message.groupBy({
          by: ['conversationId'],
          where: {
            conversationId: { in: ids },
            senderId: { not: userId },
            receipts: { some: { userId, readAt: null } },
          },
          _count: { _all: true },
        })
      : [];
    const unreadMap = new Map(unreadGroups.map((group) => [group.conversationId, group._count._all]));

    return ok(
      res,
      conversations.map((conversation) => {
        const me = conversation.participants.find((p) => p.userId === userId);
        const others = conversation.participants.filter((p) => p.userId !== userId);
        const other = others[0]?.user;
        return {
          id: conversation.id,
          type: conversation.type,
          title:
            conversation.title ||
            (other
              ? other.profile?.displayName ||
                [other.firstName, other.lastName].filter(Boolean).join(' ')
              : 'Диалог'),
          avatarUrl: other?.avatarUrl ?? null,
          participants: conversation.participants.map((p) => p.user),
          lastMessage: conversation.messages[0] ?? null,
          unreadCount: unreadMap.get(conversation.id) ?? 0,
          lastReadAt: me?.lastReadAt ?? null,
          isMuted: me?.isMuted ?? false,
          lastMessageAt: conversation.lastMessageAt,
        };
      }),
    );
  }),
);

router.post(
  '/conversations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z.object({ userId: z.string().min(1) }).parse(req.body);
    const conversation = await findOrCreateDirectConversation(req.auth!.id, body.userId);
    return ok(res, conversation);
  }),
);

router.get(
  '/conversations/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    await assertParticipant(req.params.id, userId);
    const query = z
      .object({
        before: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const messages = await prisma.message.findMany({
      where: {
        conversationId: req.params.id,
        isDeleted: false,
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
      },
      include: {
        sender: { select: userCardSelect },
        receipts: { select: { userId: true, readAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: req.params.id, userId } },
    });

    return ok(res, {
      messages: messages.reverse(),
      hasMore: messages.length === query.limit,
      lastReadAt: participant?.lastReadAt ?? null,
    });
  }),
);

router.post(
  '/conversations/:id/messages',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        content: z.string().trim().min(1).max(2000),
        type: z.enum(['TEXT', 'IMAGE', 'STICKER']).default('TEXT'),
        imageUrl: optionalImageUrlSchema,
      })
      .parse(req.body);
    const message = await sendChatMessage({
      conversationId: req.params.id,
      senderId: req.auth!.id,
      content: body.content,
      type: body.type,
      imageUrl: body.imageUrl,
    });
    return ok(res, message, 201);
  }),
);

router.post(
  '/conversations/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    await assertParticipant(req.params.id, userId);
    const now = new Date();
    await prisma.$transaction([
      prisma.messageReceipt.updateMany({
        where: {
          userId,
          readAt: null,
          message: { conversationId: req.params.id, senderId: { not: userId } },
        },
        data: { readAt: now },
      }),
      prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId: req.params.id, userId } },
        data: { lastReadAt: now },
      }),
    ]);
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: req.params.id },
      select: { userId: true },
    });
    for (const p of participants) {
      if (p.userId !== userId) {
        emitToUser(p.userId, 'chat:read', {
          conversationId: req.params.id,
          userId,
          readAt: now,
        });
      }
    }
    return ok(res, { readAt: now });
  }),
);

router.get(
  '/unread',
  requireAuth,
  asyncHandler(async (req, res) => {
    const count = await prisma.messageReceipt.count({
      where: {
        userId: req.auth!.id,
        readAt: null,
        message: { senderId: { not: req.auth!.id } },
      },
    });
    return ok(res, { count });
  }),
);

export default router;
