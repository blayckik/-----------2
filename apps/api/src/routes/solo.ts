import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { awardRewards, trackMetric } from '../services/progress.js';

const router = Router();
router.use(requireAuth);

interface MathQuestion {
  id: string;
  prompt: string;
  answer: number;
}

interface MathSession {
  id: string;
  userId: string;
  questions: MathQuestion[];
  answers: Map<string, { value: number; correct: boolean }>;
  startedAt: number;
  endsAt: number;
  finished: boolean;
}

const mathSessions = new Map<string, MathSession>();

interface NumberSession {
  id: string;
  userId: string;
  target: number;
  attempts: number;
  maxAttempts: number;
  finished: boolean;
}

const numberSessions = new Map<string, NumberSession>();

interface QuickSession {
  id: string;
  userId: string;
  game: string;
  startedAt: number;
}

const quickSessions = new Map<string, QuickSession>();

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeQuestion(): MathQuestion {
  const mode = randomInt(0, 2);
  if (mode === 0) {
    const a = randomInt(12, 89);
    const b = randomInt(11, 79);
    return { id: randomUUID(), prompt: `${a} + ${b}`, answer: a + b };
  }
  if (mode === 1) {
    const a = randomInt(30, 120);
    const b = randomInt(5, 29);
    return { id: randomUUID(), prompt: `${a} − ${b}`, answer: a - b };
  }
  const a = randomInt(3, 12);
  const b = randomInt(3, 9);
  return { id: randomUUID(), prompt: `${a} × ${b}`, answer: a * b };
}

function publicSession(session: MathSession) {
  return {
    sessionId: session.id,
    endsAt: session.endsAt,
    total: session.questions.length,
    questions: session.questions.map((question) => ({ id: question.id, prompt: question.prompt })),
  };
}

router.post(
  '/math/start',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const now = Date.now();
    for (const [id, session] of mathSessions) {
      if (session.endsAt < now - 5 * 60_000) mathSessions.delete(id);
    }
    const session: MathSession = {
      id: randomUUID(),
      userId,
      questions: Array.from({ length: 12 }, () => makeQuestion()),
      answers: new Map(),
      startedAt: now,
      endsAt: now + 60_000,
      finished: false,
    };
    mathSessions.set(session.id, session);
    return ok(res, publicSession(session));
  }),
);

router.post(
  '/math/answer',
  asyncHandler(async (req, res) => {
    const body = z.object({ sessionId: z.string(), questionId: z.string(), value: z.number().finite() }).parse(req.body);
    const session = mathSessions.get(body.sessionId);
    if (!session || session.userId !== req.auth!.id) return notFound('Игровая сессия не найдена');
    if (session.finished) throw badRequest('Игра уже завершена');
    if (Date.now() > session.endsAt) throw badRequest('Время вышло');
    const question = session.questions.find((entry) => entry.id === body.questionId);
    if (!question) return notFound('Вопрос не найден');
    if (session.answers.has(question.id)) throw badRequest('Ответ уже получен');
    const correct = Math.round(body.value) === question.answer;
    session.answers.set(question.id, { value: Math.round(body.value), correct });
    return ok(res, {
      correct,
      score: [...session.answers.values()].filter((entry) => entry.correct).length * 100,
      answered: session.answers.size,
      total: session.questions.length,
    });
  }),
);

router.post(
  '/math/finish',
  asyncHandler(async (req, res) => {
    const body = z.object({ sessionId: z.string() }).parse(req.body);
    const session = mathSessions.get(body.sessionId);
    if (!session || session.userId !== req.auth!.id) return notFound('Игровая сессия не найдена');
    if (session.finished) throw badRequest('Игра уже завершена');
    session.finished = true;
    const correct = [...session.answers.values()].filter((entry) => entry.correct).length;
    const score = correct * 100;
    const game = await prisma.game.findUnique({ where: { slug: 'math-sprint' } });
    if (!game) throw badRequest('Игра временно недоступна');
    const xp = 30 + correct * 8;
    const coins = 8 + correct * 3;
    await prisma.gameResult.create({
      data: {
        userId: req.auth!.id,
        gameId: game.id,
        outcome: correct >= 9 ? 'WIN' : correct >= 5 ? 'DRAW' : 'LOSS',
        score,
        xpEarned: xp,
        coinsEarned: coins,
        details: {
          game: 'math-sprint',
          correct,
          total: session.questions.length,
          durationMs: Date.now() - session.startedAt,
        },
      },
    });
    await awardRewards({
      userId: req.auth!.id,
      xp,
      coins,
      type: 'GAME',
      description: 'Математический спринт',
      reference: `solo:math:${session.id}`,
      metadata: { score, correct },
    });
    await trackMetric(req.auth!.id, 'GAMES_PLAYED', 1);
    if (correct >= 9) await trackMetric(req.auth!.id, 'GAMES_WON', 1);
    setTimeout(() => mathSessions.delete(session.id), 5 * 60_000).unref();
    return ok(res, { score, correct, total: session.questions.length, xp, coins });
  }),
);

router.post(
  '/number/start',
  asyncHandler(async (req, res) => {
    const session: NumberSession = {
      id: randomUUID(),
      userId: req.auth!.id,
      target: randomInt(1, 100),
      attempts: 0,
      maxAttempts: 8,
      finished: false,
    };
    numberSessions.set(session.id, session);
    return ok(res, { sessionId: session.id, attempts: 0, maxAttempts: session.maxAttempts, range: [1, 100] });
  }),
);

router.post(
  '/number/guess',
  asyncHandler(async (req, res) => {
    const body = z.object({ sessionId: z.string(), value: z.number().int().min(1).max(100) }).parse(req.body);
    const session = numberSessions.get(body.sessionId);
    if (!session || session.userId !== req.auth!.id) return notFound('Игровая сессия не найдена');
    if (session.finished) throw badRequest('Игра уже завершена');
    session.attempts += 1;
    const won = body.value === session.target;
    const exhausted = !won && session.attempts >= session.maxAttempts;
    if (!won && !exhausted) {
      return ok(res, {
        won: false,
        hint: body.value < session.target ? 'higher' : 'lower',
        attempts: session.attempts,
        maxAttempts: session.maxAttempts,
        finished: false,
      });
    }

    session.finished = true;
    const game = await prisma.game.findUnique({ where: { slug: 'number-guess' } });
    if (!game) throw badRequest('Игра временно недоступна');
    const score = won ? Math.max(100, 900 - session.attempts * 100) : 0;
    const xp = won ? 35 + Math.max(0, 8 - session.attempts) * 5 : 10;
    const coins = won ? 12 + Math.max(0, 8 - session.attempts) * 2 : 4;
    await prisma.gameResult.create({
      data: {
        userId: req.auth!.id,
        gameId: game.id,
        outcome: won ? 'WIN' : 'LOSS',
        score,
        xpEarned: xp,
        coinsEarned: coins,
        details: { game: 'number-guess', attempts: session.attempts, target: session.target },
      },
    });
    await awardRewards({
      userId: req.auth!.id,
      xp,
      coins,
      type: 'GAME',
      description: 'Угадай число',
      reference: `solo:number:${session.id}`,
      metadata: { score, attempts: session.attempts },
    });
    await trackMetric(req.auth!.id, 'GAMES_PLAYED', 1);
    if (won) await trackMetric(req.auth!.id, 'GAMES_WON', 1);
    setTimeout(() => numberSessions.delete(session.id), 5 * 60_000).unref();
    return ok(res, {
      won,
      target: session.target,
      attempts: session.attempts,
      maxAttempts: session.maxAttempts,
      finished: true,
      score,
      xp,
      coins,
    });
  }),
);

router.post(
  '/quick/start',
  asyncHandler(async (req, res) => {
    const body = z.object({ game: z.enum(['memory', 'reaction', 'odd-one-out']) }).parse(req.body);
    const session: QuickSession = {
      id: randomUUID(),
      userId: req.auth!.id,
      game: body.game,
      startedAt: Date.now(),
    };
    quickSessions.set(session.id, session);
    return ok(res, { sessionId: session.id, game: session.game });
  }),
);

router.post(
  '/quick/finish',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        sessionId: z.string(),
        score: z.number().int().min(0).max(3000),
        details: z.record(z.unknown()).optional(),
      })
      .parse(req.body);
    const session = quickSessions.get(body.sessionId);
    if (!session || session.userId !== req.auth!.id) return notFound('Игровая сессия не найдена');
    quickSessions.delete(session.id);
    const game = await prisma.game.findUnique({ where: { slug: session.game } });
    if (!game) throw badRequest('Игра временно недоступна');
    const xp = 15 + Math.round(body.score / 20);
    const coins = 5 + Math.round(body.score / 50);
    await prisma.gameResult.create({
      data: {
        userId: req.auth!.id,
        gameId: game.id,
        outcome: body.score >= 1000 ? 'WIN' : body.score >= 400 ? 'DRAW' : 'LOSS',
        score: body.score,
        xpEarned: xp,
        coinsEarned: coins,
        details: { game: session.game, ...body.details } as never,
      },
    });
    await awardRewards({
      userId: req.auth!.id,
      xp,
      coins,
      type: 'GAME',
      description: game.title,
      reference: `solo:quick:${session.id}`,
      metadata: { score: body.score, game: session.game },
    });
    await trackMetric(req.auth!.id, 'GAMES_PLAYED', 1);
    if (body.score >= 1000) await trackMetric(req.auth!.id, 'GAMES_WON', 1);
    return ok(res, { score: body.score, xp, coins });
  }),
);

export default router;
