import type { Server, Socket } from 'socket.io';
import { verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { attachQuiz } from './quiz.js';
import { attachDuel } from './duel.js';
import { attachMinigames } from './minigames.js';
import { assertParticipant, sendChatMessage } from '../services/chat.js';
import { emitToUser } from '../lib/io.js';

export function initSockets(io: Server) {
  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (typeof socket.handshake.query.token === 'string' ? socket.handshake.query.token : undefined);
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, firstName: true, isBanned: true },
      });
      if (!user || user.isBanned) return next(new Error('UNAUTHORIZED'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as { id: string; firstName: string };
    socket.join(`user:${user.id}`);
    void prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});

    socket.on('chat:send', async (payload: unknown, ackCb?: unknown) => {
      const ack = typeof ackCb === 'function' ? (ackCb as (value: unknown) => void) : () => {};
      try {
        const data = payload as { conversationId?: string; content?: string; type?: string; imageUrl?: string };
        if (!data?.conversationId || !data?.content) return ack({ error: 'Пустое сообщение' });
        const message = await sendChatMessage({
          conversationId: data.conversationId,
          senderId: user.id,
          content: data.content,
          type: data.type === 'IMAGE' ? 'IMAGE' : data.type === 'STICKER' ? 'STICKER' : 'TEXT',
          imageUrl: data.imageUrl,
        });
        return ack({ message });
      } catch (error) {
        return ack({ error: error instanceof Error ? error.message : 'Не удалось отправить сообщение' });
      }
    });

    socket.on('chat:typing', async (payload: unknown) => {
      try {
        const data = payload as { conversationId?: string; typing?: boolean };
        if (!data?.conversationId) return;
        await assertParticipant(data.conversationId, user.id);
        const participants = await prisma.conversationParticipant.findMany({
          where: { conversationId: data.conversationId },
          select: { userId: true },
        });
        for (const participant of participants) {
          if (participant.userId === user.id) continue;
          emitToUser(participant.userId, 'chat:typing', {
            conversationId: data.conversationId,
            userId: user.id,
            name: user.firstName,
            typing: Boolean(data.typing),
          });
        }
      } catch {
        // Typing indicators are best-effort.
      }
    });
  });

  attachQuiz(io);
  attachDuel(io);
  attachMinigames(io);
}
