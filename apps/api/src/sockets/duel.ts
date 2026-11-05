import type { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { awardRewards, trackMetric } from '../services/progress.js';
import { DICTIONARY, DICTIONARY_WORDS, canBuildWord } from '../data/words.js';

interface DuelMember {
  participantId: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  isBot: boolean;
  score: number;
  words: Array<{ word: string; points: number; at: number }>;
}

interface DuelRuntime {
  roomId: string;
  code: string;
  hostId: string;
  letters: string[];
  startsAt: number;
  endsAt: number;
  members: Map<string, DuelMember>;
  timers: Set<NodeJS.Timeout>;
  finishing: boolean;
  botPlan: string[];
}

const duels = new Map<string, DuelRuntime>();
const VOWELS = 'аеиоуыэюя';
const CONSONANTS = 'бвгджзклмнпрстфхцчшщ';

function code() {
  return Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
}

function randomLetters() {
  const letters: string[] = [];
  for (let i = 0; i < 6; i += 1) letters.push(VOWELS[Math.floor(Math.random() * VOWELS.length)]);
  for (let i = 0; i < 10; i += 1) letters.push(CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)]);
  return letters.sort(() => Math.random() - 0.5);
}

function normalizeWord(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').trim();
}

function wordScore(word: string) {
  if (word.length <= 3) return 5;
  if (word.length === 4) return 10;
  if (word.length === 5) return 18;
  if (word.length === 6) return 28;
  if (word.length === 7) return 40;
  return 55;
}

function ack(ack: unknown, value: unknown) {
  if (typeof ack === 'function') (ack as (value: unknown) => void)(value);
}

function clearTimers(runtime: DuelRuntime) {
  for (const timer of runtime.timers) clearTimeout(timer);
  runtime.timers.clear();
}

function schedule(runtime: DuelRuntime, fn: () => void, ms: number) {
  const timer = setTimeout(() => {
    runtime.timers.delete(timer);
    fn();
  }, ms);
  runtime.timers.add(timer);
}

function sanitize(runtime: DuelRuntime) {
  return {
    id: runtime.roomId,
    code: runtime.code,
    hostId: runtime.hostId,
    letters: runtime.letters,
    startsAt: new Date(runtime.startsAt).toISOString(),
    endsAt: new Date(runtime.endsAt).toISOString(),
    members: [...runtime.members.values()]
      .map((member) => ({
        ...member,
        words: [...member.words].sort((a, b) => b.at - a.at),
      }))
      .sort((a, b) => b.score - a.score),
  };
}

async function roomPayload(roomId: string) {
  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: {
      game: true,
      host: { select: { id: true, firstName: true, username: true, avatarUrl: true } },
      participants: {
        include: { user: { select: { id: true, firstName: true, username: true, avatarUrl: true } } },
      },
    },
  });
  if (!room) return null;
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    maxPlayers: room.maxPlayers,
    game: room.game,
    host: room.host,
    participants: room.participants.map((participant) => ({
      id: participant.id,
      userId: participant.userId,
      name: participant.user?.username
        ? `@${participant.user.username}`
        : participant.user?.firstName ?? participant.botName ?? 'Игрок',
      avatarUrl: participant.user?.avatarUrl ?? participant.botAvatar,
      isBot: participant.isBot,
      score: participant.score,
    })),
  };
}

async function finishDuel(runtime: DuelRuntime, io: Server) {
  if (runtime.finishing) return;
  runtime.finishing = true;
  clearTimers(runtime);

  try {
    const roomExists = await prisma.gameRoom.findUnique({
      where: { id: runtime.roomId },
      select: { id: true },
    });
    if (!roomExists) {
      runtime.finishing = false;
      duels.delete(runtime.code);
      return;
    }

    const ranked = [...runtime.members.values()].sort((a, b) => b.score - a.score);
    const top = ranked[0]?.score ?? 0;
    const winners = ranked.filter((member) => member.score === top && top > 0);
    const game = await prisma.game.findUnique({ where: { slug: 'word-duel' } });

    for (let index = 0; index < ranked.length; index += 1) {
      const member = ranked[index];
      if (!member.userId) continue;
      try {
        const isWinner = winners.some((winner) => winner.participantId === member.participantId);
        const xp = isWinner ? 65 : 25 + member.words.length * 2;
        const coins = isWinner ? 30 : 8 + member.words.length;

        await prisma.gameParticipant.updateMany({
          where: { id: member.participantId },
          data: { score: member.score, rank: index + 1 },
        });

        if (game) {
          await prisma.gameResult.upsert({
            where: { userId_roomId: { userId: member.userId, roomId: runtime.roomId } },
            update: {},
            create: {
              userId: member.userId,
              gameId: game.id,
              roomId: runtime.roomId,
              outcome: isWinner ? 'WIN' : 'LOSS',
              score: member.score,
              xpEarned: xp,
              coinsEarned: coins,
              details: {
                mode: 'word-duel',
                words: member.words.map((word) => word.word),
                place: index + 1,
              },
            },
          });
        }

        await awardRewards({
          userId: member.userId,
          xp,
          coins,
          type: 'GAME',
          description: `Word Duel · ${isWinner ? 'победа' : 'матч завершён'}`,
          reference: `duel:${runtime.roomId}:${member.userId}`,
        });
        await trackMetric(member.userId, 'GAMES_PLAYED', 1);
        if (member.words.length > 0) {
          await trackMetric(member.userId, 'WORDS_SUBMITTED', member.words.length);
        }
        if (isWinner) await trackMetric(member.userId, 'GAMES_WON', 1);
      } catch (error) {
        console.error('[duel:finish:member]', member.userId, error);
      }
    }

    await prisma.gameRoom.updateMany({
      where: { id: runtime.roomId },
      data: { status: 'FINISHED', finishedAt: new Date() },
    });

    io.to(`duel:${runtime.code}`).emit('duel:finished', {
      leaderboard: ranked.map((member, index) => ({
        ...member,
        place: index + 1,
        isWinner: winners.some((winner) => winner.participantId === member.participantId),
      })),
    });
  } catch (error) {
    console.error('[duel:finish]', error);
  } finally {
    runtime.finishing = false;
    schedule(runtime, () => duels.delete(runtime.code), 15 * 60_000);
  }
}

export function attachDuel(io: Server) {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user.id as string;

    socket.on('duel:create', async (payload: unknown, ackCb?: unknown) => {
      try {
        const data = payload as { isPrivate?: boolean; withBot?: boolean };
        const game = await prisma.game.findUnique({ where: { slug: 'word-duel' } });
        if (!game) return ack(ackCb, { error: 'Игра не настроена' });
        const withBot = Boolean(data?.withBot);

        await prisma.gameRoom.updateMany({
          where: { hostId: userId, status: 'WAITING', gameId: game.id },
          data: { status: 'CANCELLED' },
        });

        let roomCode = code();
        for (let i = 0; i < 5; i += 1) {
          if (!(await prisma.gameRoom.findUnique({ where: { code: roomCode } }))) break;
          roomCode = code();
        }

        const room = await prisma.gameRoom.create({
          data: {
            code: roomCode,
            gameId: game.id,
            hostId: userId,
            isPrivate: Boolean(data?.isPrivate),
            maxPlayers: 2,
            settings: { withBot },
            participants: {
              create: [
                { userId },
                ...(withBot
                  ? [{ isBot: true, botName: 'Wordy', botAvatar: '📚' }]
                  : []),
              ],
            },
          },
        });
        socket.join(`duel:${room.code}`);
        const payloadRoom = await roomPayload(room.id);
        ack(ackCb, { room: payloadRoom });
        socket.emit('duel:room', payloadRoom);
      } catch (error) {
        console.error('[duel:create]', error);
        ack(ackCb, { error: 'Не удалось создать комнату' });
      }
    });

    socket.on('duel:join', async (payload: unknown, ackCb?: unknown) => {
      try {
        const data = payload as { code?: string };
        if (!data?.code) return ack(ackCb, { error: 'Введите код' });
        const room = await prisma.gameRoom.findUnique({
          where: { code: String(data.code).toUpperCase() },
          include: { participants: true },
        });
        if (!room) return ack(ackCb, { error: 'Комната не найдена' });
        if (room.status !== 'WAITING') return ack(ackCb, { error: 'Матч уже начался или завершён' });
        if (!room.participants.some((p) => p.userId === userId)) {
          if (room.participants.length >= 2) return ack(ackCb, { error: 'Комната заполнена' });
          await prisma.gameParticipant.create({ data: { roomId: room.id, userId } });
        }
        socket.join(`duel:${room.code}`);
        const payloadRoom = await roomPayload(room.id);
        ack(ackCb, { room: payloadRoom });
        io.to(`duel:${room.code}`).emit('duel:room', payloadRoom);
      } catch (error) {
        console.error('[duel:join]', error);
        ack(ackCb, { error: 'Не удалось войти' });
      }
    });

    socket.on('duel:start', async (payload: unknown, ackCb?: unknown) => {
      try {
        const data = payload as { code?: string };
        if (!data?.code) return ack(ackCb, { error: 'Комната не найдена' });
        const room = await prisma.gameRoom.findUnique({
          where: { code: String(data.code).toUpperCase() },
          include: { participants: { include: { user: true } }, game: true },
        });
        if (!room) return ack(ackCb, { error: 'Комната не найдена' });
        if (room.hostId !== userId) return ack(ackCb, { error: 'Начать матч может только хост' });
        if (room.status !== 'WAITING') return ack(ackCb, { error: 'Матч уже запущен' });
        if (room.participants.length < 2) {
          return ack(ackCb, { error: 'Пригласите друга или начните матч с ботом' });
        }

        const letters = randomLetters();
        const members = new Map<string, DuelMember>();
        for (const participant of room.participants) {
          members.set(participant.id, {
            participantId: participant.id,
            userId: participant.userId,
            name: participant.user?.username
              ? `@${participant.user.username}`
              : participant.user?.firstName ?? participant.botName ?? 'Игрок',
            avatarUrl: participant.user?.avatarUrl ?? participant.botAvatar,
            isBot: participant.isBot,
            score: 0,
            words: [],
          });
        }

        const now = Date.now();
        const runtime: DuelRuntime = {
          roomId: room.id,
          code: room.code,
          hostId: room.hostId,
          letters,
          startsAt: now,
          endsAt: now + 90_000,
          members,
          timers: new Set(),
          finishing: false,
          botPlan: [],
        };
        duels.set(room.code, runtime);
        await prisma.gameRoom.update({
          where: { id: room.id },
          data: { status: 'PLAYING', startedAt: new Date(now) },
        });

        const bot = [...members.values()].find((member) => member.isBot);
        if (bot) {
          const possible = DICTIONARY_WORDS.filter(
            (word) => word.length >= 3 && word.length <= 7 && canBuildWord(word, letters),
          );
          runtime.botPlan = possible.sort(() => Math.random() - 0.5).slice(0, 9);
          runtime.botPlan.forEach((word, index) => {
            schedule(
              runtime,
              async () => {
                if (Date.now() > runtime.endsAt) return;
                if (bot.words.some((entry) => entry.word === word)) return;
                const points = wordScore(word);
                bot.score += points;
                bot.words.push({ word, points, at: Date.now() });
                await prisma.gameParticipant.update({
                  where: { id: bot.participantId },
                  data: { score: bot.score },
                });
                io.to(`duel:${runtime.code}`).emit('duel:word', {
                  participantId: bot.participantId,
                  word,
                  points,
                  score: bot.score,
                  isBot: true,
                });
              },
              5000 + index * 7500 + Math.random() * 3000,
            );
          });
        }

        socket.join(`duel:${room.code}`);
        ack(ackCb, { started: true });
        io.to(`duel:${room.code}`).emit('duel:started', sanitize(runtime));
        schedule(runtime, () => void finishDuel(runtime, io), 90_000);
      } catch (error) {
        console.error('[duel:start]', error);
        ack(ackCb, { error: 'Не удалось начать матч' });
      }
    });

    socket.on('duel:submit', async (payload: unknown, ackCb?: unknown) => {
      try {
        const data = payload as { code?: string; word?: string };
        const runtime = data?.code ? duels.get(String(data.code).toUpperCase()) : undefined;
        if (!runtime) return ack(ackCb, { error: 'Матч не активен' });
        if (Date.now() >= runtime.endsAt) return ack(ackCb, { error: 'Время вышло' });

        const member = [...runtime.members.values()].find((m) => m.userId === userId);
        if (!member) return ack(ackCb, { error: 'Вы не участник матча' });

        const word = normalizeWord(String(data?.word ?? ''));
        if (word.length < 3) return ack(ackCb, { error: 'Минимум 3 буквы' });
        if (word.length > 9) return ack(ackCb, { error: 'Слишком длинное слово' });
        if (!/^[а-я]+$/.test(word)) return ack(ackCb, { error: 'Только русские буквы' });
        if (!canBuildWord(word, runtime.letters)) {
          return ack(ackCb, { error: 'Это слово нельзя собрать из доступных букв' });
        }
        if (!DICTIONARY.has(word)) return ack(ackCb, { error: 'Такого слова нет в словаре' });
        if (member.words.some((entry) => entry.word === word)) {
          return ack(ackCb, { error: 'Вы уже составили это слово' });
        }

        const points = wordScore(word);
        member.score += points;
        member.words.push({ word, points, at: Date.now() });
        await prisma.gameParticipant.update({
          where: { id: member.participantId },
          data: { score: member.score },
        });

        ack(ackCb, { accepted: true, word, points, score: member.score });
        io.to(`duel:${runtime.code}`).emit('duel:word', {
          participantId: member.participantId,
          word,
          points,
          score: member.score,
          isBot: false,
        });
      } catch (error) {
        console.error('[duel:submit]', error);
        ack(ackCb, { error: 'Не удалось проверить слово' });
      }
    });

    socket.on('duel:sync', (payload: unknown, ackCb?: unknown) => {
      const data = payload as { code?: string };
      const runtime = data?.code ? duels.get(String(data.code).toUpperCase()) : undefined;
      if (!runtime) return ack(ackCb, { error: 'Матч не найден' });
      ack(ackCb, { state: sanitize(runtime) });
    });
  });
}

export const duelRuntimeCount = () => duels.size;
