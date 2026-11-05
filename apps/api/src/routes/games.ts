import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { awardRewards, trackMetric } from '../services/progress.js';
import { userCardSelect, friendIds } from '../services/users.js';
import { notifyUser } from '../services/notifications.js';
import { env } from '../config/env.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const games = await prisma.game.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const enriched = await Promise.all(
      games.map(async (game) => ({
        ...game,
        activeRooms: await prisma.gameRoom.count({
          where: { gameId: game.id, status: { in: ['WAITING', 'PLAYING'] } },
        }),
        activePlayers: await prisma.gameParticipant.count({
          where: { room: { gameId: game.id, status: 'PLAYING' } },
        }),
        playedByMe: await prisma.gameResult.count({ where: { userId: _req.auth!.id, gameId: game.id } }),
      })),
    );
    return ok(res, enriched);
  }),
);

router.get(
  '/categories',
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = z.object({ game: z.string().optional() }).parse(req.query);
    const game = query.game
      ? await prisma.game.findUnique({ where: { slug: query.game }, select: { id: true } })
      : null;
    const categories = await prisma.category.findMany({
      where: { type: 'QUIZ', isActive: true },
      orderBy: { name: 'asc' },
    });
    const counts = await prisma.gameQuestion.groupBy({
      by: ['categoryId'],
      where: { isActive: true, isApproved: true, gameId: game?.id },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((row) => [row.categoryId, row._count._all]));
    return ok(
      res,
      categories
        .map((category) => ({
          ...category,
          questions: countMap.get(category.id) ?? 0,
        }))
        .filter((category) => (query.game ? category.questions > 0 : true)),
    );
  }),
);

router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
    const results = await prisma.gameResult.findMany({
      where: { userId: req.auth!.id },
      include: {
        game: true,
        room: {
          include: {
            game: true,
            participants: { include: { user: { select: userCardSelect } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 10,
      take: 10,
    });
    return ok(res, results);
  }),
);

router.get(
  '/quiz/rooms',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const rooms = await prisma.gameRoom.findMany({
      where: {
        status: 'WAITING',
        isPrivate: false,
        game: { slug: 'quiz-battle' },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
      include: {
        host: { select: userCardSelect },
        game: true,
        category: true,
        participants: { include: { user: { select: userCardSelect } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return ok(res, rooms);
  }),
);

router.get(
  '/room/:code',
  requireAuth,
  asyncHandler(async (req, res) => {
    const room = await prisma.gameRoom.findUnique({
      where: { code: req.params.code.toUpperCase() },
      include: {
        host: { select: userCardSelect },
        game: true,
        category: true,
        participants: { include: { user: { select: userCardSelect } } },
      },
    });
    if (!room) return notFound('Комната не найдена');
    return ok(res, room);
  }),
);

router.post(
  '/room/:code/invite',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const body = z
      .object({ userIds: z.array(z.string()).max(20).optional() })
      .parse(req.body ?? {});
    const room = await prisma.gameRoom.findUnique({
      where: { code: req.params.code.toUpperCase() },
      include: { game: true, participants: true, host: true },
    });
    if (!room) return notFound('Комната не найдена');
    if (!room.participants.some((participant) => participant.userId === userId)) {
      throw badRequest('Сначала войдите в комнату');
    }
    if (room.status !== 'WAITING') throw badRequest('Игра уже началась');

    const friends = await friendIds(userId);
    const requested = body.userIds?.length ? body.userIds.filter((id) => friends.includes(id)) : friends;
    const profiles = await prisma.userProfile.findMany({
      where: { userId: { in: requested } },
      select: { userId: true, allowGameInvites: true },
    });
    const restricted = new Set(
      profiles.filter((profile) => profile.allowGameInvites === false).map((profile) => profile.userId),
    );
    const targets = requested.filter((id) => !restricted.has(id));
    if (!targets.length) throw badRequest('Нет друзей, доступных для приглашения');

    let sent = 0;
    for (const friendId of targets.slice(0, 20)) {
      await notifyUser({
        userId: friendId,
        type: 'GAME_INVITE',
        title: `Приглашение в ${room.game.title} 🎮`,
        body: `${req.auth!.username ? '@' + req.auth!.username : 'Друг'} ждёт вас в комнате ${room.code}. Откройте FUNBOX и присоединяйтесь!`,
        data: { roomCode: room.code, game: room.game.slug, inviteLink: `https://t.me/${env.BOT_USERNAME}?startapp=room_${room.code}` },
      });
      sent += 1;
    }
    return ok(res, {
      sent,
      link: `https://t.me/${env.BOT_USERNAME}?startapp=room_${room.code}`,
      code: room.code,
    });
  }),
);

// ── Would You Rather ────────────────────────────────────────

async function wyrPayload(questionIds: string[], userId: string) {
  const [questions, grouped, myVotes] = await Promise.all([
    prisma.gameQuestion.findMany({
      where: { id: { in: questionIds } },
      include: { author: { select: userCardSelect } },
    }),
    prisma.wouldYouRatherVote.groupBy({
      by: ['questionId', 'choice'],
      where: { questionId: { in: questionIds } },
      _count: { _all: true },
    }),
    prisma.wouldYouRatherVote.findMany({
      where: { userId, questionId: { in: questionIds } },
    }),
  ]);
  const map = new Map<string, { a: number; b: number }>();
  for (const row of grouped) {
    const entry = map.get(row.questionId) ?? { a: 0, b: 0 };
    if (row.choice === 0) entry.a = row._count._all;
    else entry.b = row._count._all;
    map.set(row.questionId, entry);
  }
  const voteMap = new Map(myVotes.map((vote) => [vote.questionId, vote.choice]));

  return questionIds
    .map((id) => questions.find((question) => question.id === id))
    .filter((question): question is (typeof questions)[number] => Boolean(question))
    .map((question) => {
      const counts = map.get(question.id) ?? { a: 0, b: 0 };
      const total = counts.a + counts.b;
      return {
        id: question.id,
        prompt: question.prompt,
        options: question.options as string[],
        category: question.categoryId,
        author: question.author,
        votes: counts,
        totalVotes: total,
        percentA: total ? Math.round((counts.a / total) * 100) : 50,
        percentB: total ? 100 - Math.round((counts.a / total) * 100) : 50,
        myChoice: voteMap.get(question.id) ?? null,
      };
    });
}

router.get(
  '/wyr/questions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = z
      .object({ count: z.coerce.number().int().min(1).max(20).default(8), fresh: z.coerce.boolean().default(false) })
      .parse(req.query);
    const voted = query.fresh
      ? (
          await prisma.wouldYouRatherVote.findMany({
            where: { userId: req.auth!.id },
            select: { questionId: true },
          })
        ).map((v) => v.questionId)
      : [];

    const questions = await prisma.gameQuestion.findMany({
      where: {
        game: { slug: 'would-you-rather' },
        isActive: true,
        isApproved: true,
        ...(voted.length ? { id: { notIn: voted } } : {}),
      },
      select: { id: true },
      take: 100,
    });
    const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, query.count);
    const payload = await wyrPayload(shuffled.map((q) => q.id), req.auth!.id);
    return ok(res, payload);
  }),
);

router.post(
  '/wyr/:id/vote',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const questionId = req.params.id;
    const body = z.object({ choice: z.number().int().min(0).max(1) }).parse(req.body);
    const question = await prisma.gameQuestion.findFirst({
      where: { id: questionId, game: { slug: 'would-you-rather' }, isActive: true, isApproved: true },
    });
    if (!question) return notFound('Вопрос не найден');

    const existing = await prisma.wouldYouRatherVote.findUnique({
      where: { questionId_userId: { questionId, userId } },
    });
    if (existing) throw badRequest('Вы уже голосовали');

    try {
      await prisma.wouldYouRatherVote.create({ data: { questionId, userId, choice: body.choice } });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        throw badRequest('Вы уже голосовали');
      }
      throw error;
    }

    await awardRewards({
      userId,
      xp: 5,
      coins: 2,
      type: 'GAME',
      description: 'Голос в Would You Rather',
      reference: `wyr:${questionId}:${userId}`,
    });
    await trackMetric(userId, 'WYR_VOTES', 1);

    const [a, b] = await Promise.all([
      prisma.wouldYouRatherVote.count({ where: { questionId, choice: 0 } }),
      prisma.wouldYouRatherVote.count({ where: { questionId, choice: 1 } }),
    ]);
    const total = a + b;
    return ok(res, {
      votes: { a, b },
      totalVotes: total,
      percentA: total ? Math.round((a / total) * 100) : 50,
      percentB: total ? 100 - Math.round((a / total) * 100) : 50,
      myChoice: body.choice,
      reward: { xp: 5, coins: 2 },
    });
  }),
);

router.post(
  '/wyr/questions',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const body = z
      .object({
        optionA: z.string().trim().min(3).max(90),
        optionB: z.string().trim().min(3).max(90),
        categoryId: z.string().optional(),
      })
      .parse(req.body);
    const game = await prisma.game.findUnique({ where: { slug: 'would-you-rather' } });
    if (!game) return notFound('Игра не настроена');

    const question = await prisma.gameQuestion.create({
      data: {
        gameId: game.id,
        authorId: userId,
        categoryId: body.categoryId,
        prompt: 'Что вы выберете?',
        options: [body.optionA, body.optionB] as Prisma.InputJsonValue,
        isApproved: false,
        difficulty: 'EASY',
      },
    });
    return ok(
      res,
      { ...question, moderation: 'Вопрос отправлен на модерацию и появится после проверки.' },
      201,
    );
  }),
);

router.get(
  '/wyr/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const questions = await prisma.gameQuestion.findMany({
      where: { authorId: req.auth!.id, game: { slug: 'would-you-rather' } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, questions);
  }),
);

// ── Guess the Image ────────────────────────────────────────

function normalizeGuess(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

router.get(
  '/image/round',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const query = z
      .object({ category: z.string().optional(), exclude: z.string().optional() })
      .parse(req.query);

    const attempts = await prisma.imageAttempt.findMany({
      where: { userId },
      select: { questionId: true, solved: true, attempts: true },
    });
    const solvedIds = attempts.filter((a) => a.solved).map((a) => a.questionId);
    const candidates = await prisma.gameQuestion.findMany({
      where: {
        game: { slug: 'guess-image' },
        isActive: true,
        ...(query.category ? { category: { slug: query.category } } : {}),
        ...(query.exclude ? { id: { not: query.exclude } } : {}),
        ...(solvedIds.length ? { id: { notIn: solvedIds } } : {}),
      },
      include: { category: true },
      take: 100,
    });
    if (!candidates.length) {
      if (solvedIds.length) {
        await prisma.imageAttempt.deleteMany({ where: { userId, solved: true } });
        return ok(res, { reset: true, round: null });
      }
      return ok(res, { round: null });
    }
    const question = candidates[Math.floor(Math.random() * candidates.length)];
    const attempt = attempts.find((a) => a.questionId === question.id);
    const hints = Array.isArray(question.options) ? (question.options as string[]) : [];

    return ok(res, {
      round: {
        id: question.id,
        mediaUrl: question.mediaUrl,
        prompt: question.prompt,
        category: question.category,
        difficulty: question.difficulty,
        hint: hints[0] ?? 'Внимательно рассмотрите детали изображения.',
        hintsCount: hints.length,
        attempts: attempt?.attempts ?? 0,
        attemptsLeft: Math.max(0, 3 - (attempt?.attempts ?? 0)),
      },
    });
  }),
);

router.post(
  '/image/:id/guess',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const questionId = req.params.id;
    const body = z.object({ guess: z.string().trim().min(1).max(120) }).parse(req.body);
    const question = await prisma.gameQuestion.findFirst({
      where: { id: questionId, game: { slug: 'guess-image' }, isActive: true },
    });
    if (!question?.answerText) return notFound('Раунд не найден');

    const attempt = await prisma.imageAttempt.upsert({
      where: { userId_questionId: { userId, questionId } },
      update: {},
      create: { userId, questionId },
    });
    if (attempt.solved) {
      return ok(res, { correct: true, alreadySolved: true, attemptsLeft: 0, answer: question.answerText });
    }
    if (attempt.attempts >= 3) {
      return ok(res, {
        correct: false,
        attemptsLeft: 0,
        answer: question.answerText,
        message: 'Попытки закончились. Ответ раскрыт.',
      });
    }

    const correct =
      normalizeGuess(body.guess) === normalizeGuess(question.answerText) ||
      normalizeGuess(question.answerText).includes(normalizeGuess(body.guess)) && normalizeGuess(body.guess).length >= 4;

    const updated = await prisma.imageAttempt.update({
      where: { userId_questionId: { userId, questionId } },
      data: {
        attempts: { increment: 1 },
        lastGuess: body.guess,
        ...(correct ? { solved: true } : {}),
      },
    });
    const hints = Array.isArray(question.options) ? (question.options as string[]) : [];
    const nextHint = hints[Math.min(updated.attempts, hints.length - 1)] ?? null;

    if (correct) {
      await awardRewards({
        userId,
        xp: 30,
        coins: 12,
        type: 'GAME',
        description: `Угадано изображение: ${question.answerText}`,
        reference: `image:${questionId}:${userId}`,
        metadata: { questionId },
      });
      await trackMetric(userId, 'IMAGES_GUESSED', 1);
      await trackMetric(userId, 'GAMES_PLAYED', 1);
      await trackMetric(userId, 'GAMES_WON', 1);
      const game = await prisma.game.findUnique({ where: { slug: 'guess-image' } });
      if (game) {
        await prisma.gameResult.create({
          data: {
            userId,
            gameId: game.id,
            outcome: 'WIN',
            score: 30,
            xpEarned: 30,
            coinsEarned: 12,
            details: { questionId, mode: 'guess-image' },
          },
        });
      }
    }

    return ok(res, {
      correct,
      attemptsLeft: Math.max(0, 3 - updated.attempts),
      attempts: updated.attempts,
      nextHint: correct ? null : nextHint,
      answer: correct || updated.attempts >= 3 ? question.answerText : null,
      reward: correct ? { xp: 30, coins: 12 } : null,
    });
  }),
);

export default router;
