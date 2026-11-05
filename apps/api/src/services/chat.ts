import { prisma } from '../lib/prisma.js';
import { HttpError, badRequest, forbidden, notFound } from '../lib/http.js';
import { emitToUser } from '../lib/io.js';
import { trackMetric } from './progress.js';
import { notifyUser } from './notifications.js';
import { userCardSelect } from './users.js';

export async function assertParticipant(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) throw forbidden('Нет доступа к диалогу');
  return participant;
}

export async function sendChatMessage(params: {
  conversationId: string;
  senderId: string;
  content: string;
  type?: 'TEXT' | 'IMAGE' | 'STICKER';
  imageUrl?: string | null;
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    include: { participants: { select: { userId: true } } },
  });
  if (!conversation) throw notFound('Диалог не найден');
  if (!conversation.participants.some((p) => p.userId === params.senderId)) {
    throw forbidden('Нет доступа к диалогу');
  }

  const others = conversation.participants.map((p) => p.userId).filter((id) => id !== params.senderId);
  if (others.length) {
    const block = await prisma.block.findFirst({
      where: {
        OR: others.flatMap((otherId) => [
          { blockerId: params.senderId, blockedId: otherId },
          { blockerId: otherId, blockedId: params.senderId },
        ]),
      },
    });
    if (block) throw badRequest('Пользователь ограничил переписку');
  }

  const content = params.content.trim();
  if (!content) throw badRequest('Сообщение не может быть пустым');
  if (content.length > 2000) throw badRequest('Сообщение слишком длинное');

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: params.conversationId,
        senderId: params.senderId,
        content,
        type: params.type ?? 'TEXT',
        imageUrl: params.imageUrl || null,
        receipts: {
          create: others.map((userId) => ({ userId })),
        },
      },
      include: {
        sender: { select: userCardSelect },
        receipts: true,
      },
    });
    await tx.conversation.update({
      where: { id: params.conversationId },
      data: { lastMessageAt: new Date() },
    });
    return created;
  });

  await trackMetric(params.senderId, 'MESSAGES_SENT', 1);
  emitToUser(params.senderId, 'chat:new', { message, conversationId: params.conversationId });
  const recipientActivity = await prisma.user.findMany({
    where: { id: { in: others } },
    select: { id: true, lastActiveAt: true },
  });
  const activeIds = new Set(
    recipientActivity
      .filter((recipient) => Date.now() - recipient.lastActiveAt.getTime() < 2 * 60_000)
      .map((recipient) => recipient.id),
  );
  for (const otherId of others) {
    emitToUser(otherId, 'chat:new', { message, conversationId: params.conversationId });
    void notifyUser({
      userId: otherId,
      type: 'MESSAGE',
      title: 'Новое сообщение 💬',
      body: content.slice(0, 120),
      data: { conversationId: params.conversationId },
      telegram: !activeIds.has(otherId),
    });
  }

  return message;
}

export async function findOrCreateDirectConversation(userId: string, otherId: string) {
  if (userId === otherId) throw badRequest('Нельзя открыть диалог с собой');
  const other = await prisma.user.findUnique({
    where: { id: otherId },
    include: { profile: true },
  });
  if (!other || other.isBanned) throw notFound('Пользователь не найден');

  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherId },
        { blockerId: otherId, blockedId: userId },
      ],
    },
  });
  if (block) throw new HttpError(403, 'Пользователь недоступен', 'BLOCKED');

  const candidates = await prisma.conversation.findMany({
    where: {
      type: 'DIRECT',
      participants: { some: { userId } },
    },
    include: { participants: true },
  });
  const existing = candidates.find(
    (conversation) =>
      conversation.participants.length === 2 &&
      conversation.participants.some((p) => p.userId === otherId),
  );
  if (existing) return existing;

  const [a, b] = userId < otherId ? [userId, otherId] : [otherId, userId];
  const friendship = await prisma.friendship.findUnique({
    where: { userAId_userBId: { userAId: a, userBId: b } },
  });
  if (!friendship && other.profile?.allowStrangersMessages === false) {
    throw new HttpError(403, 'Пользователь принимает сообщения только от друзей', 'MESSAGES_RESTRICTED');
  }

  return prisma.conversation.create({
    data: {
      type: 'DIRECT',
      createdById: userId,
      participants: {
        create: [{ userId }, { userId: otherId }],
      },
    },
    include: { participants: true },
  });
}
