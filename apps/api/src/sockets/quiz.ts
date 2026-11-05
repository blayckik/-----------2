import type { Server, Socket } from 'socket.io';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { awardRewards, trackMetric } from '../services/progress.js';

type Phase = 'question' | 'reveal' | 'finished';

interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOption: number;
  hint: string | null;
  mediaUrl: string | null;
  difficulty: string;
}

interface Member {
  participantId: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  isBot: boolean;
  score: number;
  correct: number;
}

interface Runtime {
  roomId: string;
  code: string;
  hostId: string;
  categoryId: string | null;
  questions: QuizQuestion[];
  index: number;
  phase: Phase;
  questionStartedAt: number;
  durationMs: number;
  members: Map<string, Member>;
  answers: Map<string, Map<string, { choice: number; correct: boolean; points: number }>>;
  timers: Set<NodeJS.Timeout>;
  finishing: boolean;
}

const runtimes = new Map<string, Runtime>();
const BOTS = [
  { name: 'Quizzy', avatar: '🤖' },
  { name: 'NovaBot', avatar: '🛸' },
  { name: 'Brainiac', avatar: '🧠' },
  { name: 'Pixel', avatar: '👾' },
  { name: 'Lucky', avatar: '🍀' },
];

function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function ackError(ack: unknown, message: string) {
  if (typeof ack === 'function') (ack as (value: unknown) => void)({ error: message });
}

function ackOk(ack: unknown, value: unknown) {
  if (typeof ack === 'function') (ack as (value: unknown) => void)(value);
}

function clearTimers(runtime: Runtime) {
  for (const timer of runtime.timers) clearTimeout(timer);
  runtime.timers.clear();
}

function schedule(runtime: Runtime, fn: () => void, ms: number) {
  const timer = setTimeout(() => {
    runtime.timers.delete(timer);
    fn();
  }, ms);
  runtime.timers.add(timer);
}

function sanitize(runtime: Runtime) {
  return {
    id: runtime.roomId,
    code: runtime.code,
    hostId: runtime.hostId,
    categoryId: runtime.categoryId,
    status: runtime.phase === 'finished' ? 'FINISHED' : 'PLAYING',
    questionIndex: runtime.index,
    totalQuestions: runtime.questions.length,
    phase: runtime.phase,
    participants: [...runtime.members.values()]
      .map((member) => ({
        id: member.participantId,
        userId: member.userId,
        name: member.name,
        avatarUrl: member.avatarUrl,
        isBot: member.isBot,
        score: member.score,
        correct: member.correct,
      }))
      .sort((a, b) => b.score - a.score),
  };
}

async function roomPayload(roomId: string) {
  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: {
      game: true,
      category: true,
      host: { select: { id: true, firstName: true, username: true, avatarUrl: true } },
      participants: {
        include: {
          user: { select: { id: true, firstName: true, username: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!room) return null;
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    isPrivate: room.isPrivate,
    maxPlayers: room.maxPlayers,
    game: room.game,
    category: room.category,
    host: room.host,
    createdAt: room.createdAt,
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

function msForDifficulty(difficulty: string) {
  if (difficulty === 'EASY') return 15_000;
  if (difficulty === 'HARD') return 22_000;
  return 18_000;
}

async function finish(runtime: Runtime, io: Server) {
  if (runtime.finishing || runtime.phase === 'finished') return;
  runtime.finishing = true;
  clearTimers(runtime);

  try {
    const roomExists = await prisma.gameRoom.findUnique({
      where: { id: runtime.roomId },
      select: { id: true },
    });
    if (!roomExists) {
      runtimes.delete(runtime.code);
      return;
    }

    const ranked = [...runtime.members.values()].sort((a, b) => b.score - a.score);
    const topScore = ranked[0]?.score ?? 0;
    const winners = ranked.filter((member) => member.score === topScore && topScore > 0);

    for (let index = 0; index < ranked.length; index += 1) {
      const member = ranked[index];
      if (member.userId) {
        await prisma.gameParticipant.updateMany({
          where: { id: member.participantId },
          data: { score: member.score, correct: member.correct, rank: index + 1 },
        });
      }
    }

    const rewards: Array<{ userId: string; xp: number; coins: number; place: number }> = [];
    const game = await prisma.game.findUnique({ where: { slug: 'quiz-battle' } });

    for (let index = 0; index < ranked.length; index += 1) {
      const member = ranked[index];
      if (!member.userId || member.isBot) continue;
      try {
        const isWinner = winners.some((winner) => winner.participantId === member.participantId);
        const xp = (isWinner ? 70 : 30) + member.correct * 6;
        const coins = (isWinner ? 35 : 10) + member.correct * 2;

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
              details: { correct: member.correct, place: index + 1, mode: 'quiz-battle' },
            },
          });
        }

        await awardRewards({
          userId: member.userId,
          xp,
          coins,
          type: 'GAME',
          description: `Quiz Battle · ${isWinner ? 'победа' : `${index + 1} место`}`,
          reference: `quiz:${runtime.roomId}:${member.userId}`,
          metadata: { roomId: runtime.roomId, score: member.score },
        });
        await trackMetric(member.userId, 'GAMES_PLAYED', 1);
        if (isWinner) {
          await trackMetric(member.userId, 'GAMES_WON', 1);
          await trackMetric(member.userId, 'QUIZ_WINS', 1);
        }
        rewards.push({ userId: member.userId, xp, coins, place: index + 1 });
      } catch (error) {
        console.error('[quiz:finish:member]', member.userId, error);
      }
    }

    await prisma.gameRoom.updateMany({
      where: { id: runtime.roomId },
      data: { status: 'FINISHED', finishedAt: new Date() },
    });

    runtime.phase = 'finished';
    io.to(`quiz:${runtime.code}`).emit('quiz:finished', {
      leaderboard: ranked.map((member, index) => ({
        ...member,
        place: index + 1,
        isWinner: winners.some((winner) => winner.participantId === member.participantId),
      })),
      rewards,
    });
  } catch (error) {
    console.error('[quiz:finish]', error);
  } finally {
    runtime.finishing = false;
    schedule(runtime, () => runtimes.delete(runtime.code), 15 * 60_000);
  }
}

function reveal(runtime: Runtime, io: Server) {
  if (runtime.phase !== 'question') return;
  runtime.phase = 'reveal';
  clearTimers(runtime);
  const question = runtime.questions[runtime.index];
  if (!question) return;
  const answerMap = runtime.answers.get(question.id) ?? new Map();
  const distribution = question.options.map(
    (_, optionIndex) => [...answerMap.values()].filter((answer) => answer.choice === optionIndex).length,
  );

  io.to(`quiz:${runtime.code}`).emit('quiz:reveal', {
    questionIndex: runtime.index,
    correctOption: question.correctOption,
    distribution,
    answered: answerMap.size,
    leaderboard: sanitize(runtime).participants,
  });

  schedule(runtime, () => nextQuestion(runtime, io), 4600);
}

function beginQuestion(runtime: Runtime, io: Server) {
  runtime.index += 1;
  if (runtime.index >= runtime.questions.length) {
    void finish(runtime, io);
    return;
  }
  const question = runtime.questions[runtime.index];
  runtime.phase = 'question';
  runtime.questionStartedAt = Date.now();
  runtime.durationMs = msForDifficulty(question.difficulty);
  runtime.answers.set(question.id, new Map());

  io.to(`quiz:${runtime.code}`).emit('quiz:question', {
    questionIndex: runtime.index,
    totalQuestions: runtime.questions.length,
    prompt: question.prompt,
    options: question.options,
    hint: question.hint,
    mediaUrl: question.mediaUrl,
    difficulty: question.difficulty,
    durationMs: runtime.durationMs,
    endsAt: new Date(runtime.questionStartedAt + runtime.durationMs).toISOString(),
  });

  const currentIndex = runtime.index;
  const questionId = question.id;
  schedule(runtime, () => {
    if (runtime.index === currentIndex && runtime.phase === 'question') reveal(runtime, io);
  }, runtime.durationMs);

  for (const member of runtime.members.values()) {
    if (!member.isBot) continue;
    const delay = 1800 + Math.random() * 7500;
    schedule(runtime, async () => {
      if (runtime.phase !== 'question' || runtime.index !== currentIndex) return;
      const map = runtime.answers.get(questionId);
      if (!map || map.has(member.participantId)) return;
      const correct = Math.random() < (question.difficulty === 'HARD' ? 0.5 : 0.68);
      const choice = correct
        ? question.correctOption
        : (question.correctOption + 1 + Math.floor(Math.random() * (question.options.length - 1))) %
          question.options.length;
      const responseMs = Math.round(delay);
      const points = correct ? 100 + Math.round((1 - responseMs / runtime.durationMs) * 50) : 0;
      map.set(member.participantId, { choice, correct, points });
      member.score += points;
      if (correct) member.correct += 1;
      try {
        await prisma.gameAnswer.create({
          data: {
            roomId: runtime.roomId,
            participantId: member.participantId,
            questionId,
            selected: choice,
            isCorrect: correct,
            points,
            responseMs,
          },
        });
      } catch {
        // Unique constraint protects a double answer; ignore.
      }
      io.to(`quiz:${runtime.code}`).emit('quiz:answered', {
        questionIndex: currentIndex,
        answered: map.size,
        total: runtime.members.size,
      });
      if (map.size >= runtime.members.size) {
        schedule(runtime, () => {
          if (runtime.index === currentIndex) reveal(runtime, io);
        }, 500);
      }
    }, delay);
  }
}

function nextQuestion(runtime: Runtime, io: Server) {
  if (runtime.phase === 'finished') return;
  beginQuestion(runtime, io);
}

async function loadRuntime(roomId: string): Promise<Runtime | null> {
  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: {
      participants: { include: { user: true } },
      questions: { orderBy: { order: 'asc' }, include: { question: true } },
    },
  });
  if (!room) return null;
  const members = new Map<string, Member>();
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
      correct: 0,
    });
  }
  return {
    roomId: room.id,
    code: room.code,
    hostId: room.hostId,
    categoryId: room.categoryId,
    questions: room.questions.map(({ question }) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options as string[],
      correctOption: question.correctOption ?? 0,
      hint: question.hint,
      mediaUrl: question.mediaUrl,
      difficulty: question.difficulty,
    })),
    index: -1,
    phase: 'question',
    questionStartedAt: 0,
    durationMs: 18_000,
    members,
    answers: new Map(),
    timers: new Set(),
    finishing: false,
  };
}

export function attachQuiz(io: Server) {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user.id as string;

    socket.on('quiz:create', async (payload: unknown, ack?: unknown) => {
      try {
        const data = payload as {
          categoryId?: string;
          isPrivate?: boolean;
          botCount?: number;
          questionCount?: number;
        };
        const game = await prisma.game.findUnique({ where: { slug: 'quiz-battle' } });
        if (!game) return ackError(ack, 'Игра не настроена');
        const botCount = Math.max(0, Math.min(5, Math.floor(Number(data.botCount ?? 0))));
        const questionCount = Math.max(3, Math.min(12, Math.floor(Number(data.questionCount ?? 7))));
        if (data.categoryId) {
          const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
          if (!category) return ackError(ack, 'Категория не найдена');
        }

        await prisma.gameRoom.updateMany({
          where: { hostId: userId, status: 'WAITING', gameId: game.id },
          data: { status: 'CANCELLED' },
        });

        let roomCode = code();
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const exists = await prisma.gameRoom.findUnique({ where: { code: roomCode } });
          if (!exists) break;
          roomCode = code();
        }

        const room = await prisma.gameRoom.create({
          data: {
            code: roomCode,
            gameId: game.id,
            hostId: userId,
            categoryId: data.categoryId || null,
            isPrivate: Boolean(data.isPrivate),
            maxPlayers: 3 + botCount,
            settings: { botCount, questionCount },
            participants: {
              create: [
                { userId },
                ...Array.from({ length: botCount }, (_, index) => ({
                  isBot: true,
                  botName: BOTS[index % BOTS.length].name,
                  botAvatar: BOTS[index % BOTS.length].avatar,
                })),
              ],
            },
          },
        });

        socket.join(`quiz:${room.code}`);
        const payloadRoom = await roomPayload(room.id);
        ackOk(ack, { room: payloadRoom });
        socket.emit('quiz:room', payloadRoom);
        return;
      } catch (error) {
        console.error('[quiz:create]', error);
        return ackError(ack, 'Не удалось создать комнату');
      }
    });

    socket.on('quiz:join', async (payload: unknown, ack?: unknown) => {
      try {
        const data = payload as { code?: string };
        if (!data?.code) return ackError(ack, 'Введите код комнаты');
        const room = await prisma.gameRoom.findUnique({
          where: { code: String(data.code).toUpperCase() },
          include: { participants: true },
        });
        if (!room) return ackError(ack, 'Комната не найдена');
        if (room.status === 'FINISHED' || room.status === 'CANCELLED') {
          return ackError(ack, 'Эта игра уже завершена');
        }
        const existing = room.participants.find((participant) => participant.userId === userId);
        if (!existing) {
          if (room.status === 'PLAYING') return ackError(ack, 'Игра уже началась');
          if (room.participants.length >= room.maxPlayers) return ackError(ack, 'В комнате нет мест');
          await prisma.gameParticipant.create({ data: { roomId: room.id, userId } });
        }
        socket.join(`quiz:${room.code}`);
        const payloadRoom = await roomPayload(room.id);
        ackOk(ack, { room: payloadRoom });
        io.to(`quiz:${room.code}`).emit('quiz:room', payloadRoom);
        return;
      } catch (error) {
        console.error('[quiz:join]', error);
        return ackError(ack, 'Не удалось войти в комнату');
      }
    });

    socket.on('quiz:start', async (payload: unknown, ack?: unknown) => {
      try {
        const data = payload as { code?: string };
        if (!data?.code) return ackError(ack, 'Комната не найдена');
        const room = await prisma.gameRoom.findUnique({
          where: { code: String(data.code).toUpperCase() },
          include: { participants: true, game: true },
        });
        if (!room) return ackError(ack, 'Комната не найдена');
        if (room.hostId !== userId) return ackError(ack, 'Начать игру может только хост');
        if (room.status !== 'WAITING') return ackError(ack, 'Игра уже началась');
        if (room.participants.length < 2) {
          return ackError(ack, 'Пригласите друга или создайте комнату с ботами');
        }

        const settings = (room.settings ?? {}) as { questionCount?: number };
        const questionCount = Math.max(3, Math.min(12, Number(settings.questionCount ?? 7)));
        const pool = await prisma.gameQuestion.findMany({
          where: {
            gameId: room.gameId,
            isActive: true,
            isApproved: true,
            ...(room.categoryId ? { categoryId: room.categoryId } : {}),
          },
          take: 100,
        });
        if (pool.length < 3) return ackError(ack, 'Недостаточно вопросов в этой категории');
        const selected = pool.sort(() => Math.random() - 0.5).slice(0, Math.min(questionCount, pool.length));

        await prisma.$transaction([
          prisma.gameRoomQuestion.createMany({
            data: selected.map((question, index) => ({
              roomId: room.id,
              questionId: question.id,
              order: index,
            })),
            skipDuplicates: true,
          }),
          prisma.gameRoom.update({
            where: { id: room.id },
            data: { status: 'PLAYING', startedAt: new Date() },
          }),
        ]);

        const runtime = await loadRuntime(room.id);
        if (!runtime) return ackError(ack, 'Не удалось запустить игру');
        runtimes.set(room.code, runtime);

        socket.join(`quiz:${room.code}`);
        ackOk(ack, { started: true });
        io.to(`quiz:${room.code}`).emit('quiz:started', sanitize(runtime));
        schedule(runtime, () => beginQuestion(runtime, io), 1200);
        return;
      } catch (error) {
        console.error('[quiz:start]', error);
        return ackError(ack, 'Не удалось начать игру');
      }
    });

    socket.on('quiz:answer', async (payload: unknown, ack?: unknown) => {
      try {
        const data = payload as { code?: string; questionIndex?: number; choice?: number };
        if (!data?.code) return ackError(ack, 'Комната не найдена');
        const runtime = runtimes.get(String(data.code).toUpperCase());
        if (!runtime) return ackError(ack, 'Игра не активна');
        if (runtime.phase !== 'question') return ackError(ack, 'Время ответа истекло');
        if (runtime.index !== Number(data.questionIndex)) return ackError(ack, 'Вопрос устарел');

        const member = [...runtime.members.values()].find((m) => m.userId === userId);
        if (!member) return ackError(ack, 'Вы не участник этой игры');
        const question = runtime.questions[runtime.index];
        if (!question) return ackError(ack, 'Вопрос не найден');
        const map = runtime.answers.get(question.id) ?? new Map();
        if (map.has(member.participantId)) return ackError(ack, 'Ответ уже принят');

        const choice = Number(data.choice);
        if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
          return ackError(ack, 'Некорректный вариант');
        }
        const responseMs = Math.min(runtime.durationMs, Date.now() - runtime.questionStartedAt);
        const correct = choice === question.correctOption;
        const points = correct ? 100 + Math.round((1 - responseMs / runtime.durationMs) * 50) : 0;
        map.set(member.participantId, { choice, correct, points });
        runtime.answers.set(question.id, map);
        member.score += points;
        if (correct) member.correct += 1;

        try {
          await prisma.gameAnswer.create({
            data: {
              roomId: runtime.roomId,
              participantId: member.participantId,
              userId,
              questionId: question.id,
              selected: choice,
              isCorrect: correct,
              points,
              responseMs,
            },
          });
        } catch (error) {
          if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
            return ackError(ack, 'Ответ уже принят');
          }
          throw error;
        }
        await prisma.gameParticipant.update({
          where: { id: member.participantId },
          data: { score: member.score, correct: member.correct },
        });

        ackOk(ack, { accepted: true, points });
        io.to(`quiz:${runtime.code}`).emit('quiz:answered', {
          questionIndex: runtime.index,
          answered: map.size,
          total: runtime.members.size,
        });
        const answeredIndex = runtime.index;
        if (map.size >= runtime.members.size) {
          schedule(runtime, () => {
            if (runtime.index === answeredIndex) reveal(runtime, io);
          }, 450);
        }
        return;
      } catch (error) {
        console.error('[quiz:answer]', error);
        return ackError(ack, 'Не удалось принять ответ');
      }
    });

    socket.on('quiz:sync', async (payload: unknown, ack?: unknown) => {
      const data = payload as { code?: string };
      const runtime = data?.code ? runtimes.get(String(data.code).toUpperCase()) : undefined;
      if (!runtime) return ackError(ack, 'Игра не найдена');
      const question = runtime.phase === 'question' ? runtime.questions[runtime.index] : null;
      ackOk(ack, {
        room: sanitize(runtime),
        question: question
          ? {
              questionIndex: runtime.index,
              totalQuestions: runtime.questions.length,
              prompt: question.prompt,
              options: question.options,
              hint: question.hint,
              mediaUrl: question.mediaUrl,
              difficulty: question.difficulty,
              durationMs: runtime.durationMs,
              endsAt: new Date(runtime.questionStartedAt + runtime.durationMs).toISOString(),
            }
          : null,
      });
    });

    socket.on('quiz:leave', async (payload: unknown) => {
      const data = payload as { code?: string };
      if (!data?.code) return;
      socket.leave(`quiz:${String(data.code).toUpperCase()}`);
    });
  });
}

export const quizRuntimeCount = () => runtimes.size;
