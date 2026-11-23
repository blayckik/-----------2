import type { Server, Socket } from 'socket.io';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { DICTIONARY } from '../data/words.js';
import { awardRewards, trackMetric } from '../services/progress.js';
import wordBombContent from '../content/minigames/word-bomb.json';
import bluffContent from '../content/minigames/bluff-trivia.json';
import convergeContent from '../content/minigames/converge.json';
import auctionContent from '../content/minigames/auction.json';
import minefieldContent from '../content/minigames/minefield.json';

type GameSlug = 'word-bomb' | 'bluff-trivia' | 'converge' | 'auction' | 'minefield';
type Phase = 'lobby' | 'input' | 'voting' | 'reveal' | 'playing' | 'finished';

const SYLLABLES = wordBombContent as string[];
const BLUFF_FACTS = bluffContent as Array<{ prompt: string; answer: string }>;
const CONVERGE_PAIRS = convergeContent as Array<[string, string]>;
const AUCTION_QUESTIONS = auctionContent as Array<{ prompt: string; answer: number }>;
const MINEFIELD_CATEGORIES = minefieldContent as Array<{ category: string; items: string[] }>;

interface Member {
  participantId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  score: number;
  alive: boolean;
  lives: number;
  connected: boolean;
}

interface BaseRuntime {
  roomId: string;
  gameId: string;
  code: string;
  slug: GameSlug;
  prefix: string;
  hostId: string;
  phase: Phase;
  members: Map<string, Member>;
  timers: Set<NodeJS.Timeout>;
  finished: boolean;
}

interface BombRuntime extends BaseRuntime {
  syllable: string;
  turnId: string;
  turnEndsAt: number;
  used: Set<string>;
  round: number;
}

interface AuctionRuntime extends BaseRuntime {
  questions: Array<{ prompt: string; answer: number }>;
  questionIndex: number;
  phaseEndsAt: number;
  answers: Map<string, number>;
}

interface BluffOption {
  id: string;
  text: string;
  authorId: string | null;
}

interface BluffRuntime extends BaseRuntime {
  facts: Array<{ prompt: string; answer: string }>;
  factIndex: number;
  fact: { prompt: string; answer: string };
  fakeAnswers: Map<string, string>;
  votes: Map<string, string>;
  options: BluffOption[];
  phaseEndsAt: number;
}

interface ConvergeRuntime extends BaseRuntime {
  rounds: Array<[string, string]>;
  roundIndex: number;
  phaseEndsAt: number;
  answers: Map<string, string>;
}

interface MineCard {
  id: string;
  label: string;
  isMine: boolean;
  revealed: boolean;
}

interface MineRuntime extends BaseRuntime {
  category: string;
  cards: MineCard[];
  turnId: string;
  turnEndsAt: number;
}

type Runtime = BombRuntime | AuctionRuntime | BluffRuntime | ConvergeRuntime | MineRuntime;
const runtimes = new Map<string, Runtime>();
let gameIo: Server | null = null;

const PREFIX: Record<GameSlug, string> = {
  'word-bomb': 'bomb',
  'bluff-trivia': 'bluff',
  converge: 'converge',
  auction: 'auction',
  minefield: 'mine',
};

const CHANNEL = (code: string) => `mg:${code.toUpperCase()}`;

function ackOk(ack: unknown, value: unknown) {
  if (typeof ack === 'function') (ack as (value: unknown) => void)(value);
}

function ackError(ack: unknown, error: string) {
  if (typeof ack === 'function') (ack as (value: unknown) => void)({ error });
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]/g, '')
    .trim();
}

function wordNormalize(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/[^а-я]/g, '').trim();
}

function clearTimers(runtime: BaseRuntime) {
  for (const timer of runtime.timers) clearTimeout(timer);
  runtime.timers.clear();
}

function schedule(runtime: BaseRuntime, fn: () => void, ms: number) {
  const timer = setTimeout(() => {
    runtime.timers.delete(timer);
    fn();
  }, Math.max(0, ms));
  runtime.timers.add(timer);
  return timer;
}

function memberDto(member: Member) {
  return {
    participantId: member.participantId,
    userId: member.userId,
    name: member.name,
    avatarUrl: member.avatarUrl,
    score: member.score,
    alive: member.alive,
    lives: member.lives,
    connected: member.connected,
  };
}

function commonState(runtime: Runtime) {
  return {
    roomId: runtime.roomId,
    code: runtime.code,
    gameSlug: runtime.slug,
    hostId: runtime.hostId,
    phase: runtime.phase,
    serverNow: Date.now(),
    members: [...runtime.members.values()]
      .map(memberDto)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
  };
}

function emitState(io: Server, runtime: Runtime, extra: Record<string, unknown>) {
  io.to(CHANNEL(runtime.code)).emit(`${runtime.prefix}:state`, {
    ...commonState(runtime),
    ...extra,
  });
}

async function lobbyState(code: string) {
  const room = await prisma.gameRoom.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      game: true,
      host: { select: { id: true, firstName: true, avatarUrl: true } },
      participants: {
        include: { user: { select: { id: true, firstName: true, avatarUrl: true, username: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });
  if (!room) return null;
  return {
    roomId: room.id,
    code: room.code,
    gameSlug: room.game.slug,
    game: {
      slug: room.game.slug,
      title: room.game.title,
      icon: room.game.icon,
      gradient: room.game.gradient,
      minPlayers: room.game.minPlayers,
      maxPlayers: room.game.maxPlayers,
    },
    hostId: room.hostId,
    host: room.host,
    status: room.status,
    phase: room.status === 'WAITING' ? 'lobby' : 'playing',
    isPrivate: room.isPrivate,
    maxPlayers: room.maxPlayers,
    members: room.participants.map((participant) => ({
      participantId: participant.id,
      userId: participant.userId,
      name: participant.user?.firstName ?? 'Игрок',
      username: participant.user?.username ?? null,
      avatarUrl: participant.user?.avatarUrl ?? null,
      score: participant.score,
      alive: true,
      connected: true,
    })),
  };
}

async function startRoom(
  io: Server,
  socket: Socket,
  code: string,
  slug: GameSlug,
  minPlayers: number,
  maxPlayers: number,
  makeRuntime: (room: NonNullable<Awaited<ReturnType<typeof roomForStart>>>) => Runtime,
  ack?: unknown,
): Promise<Runtime | null> {
  const room = await roomForStart(code);
  if (!room) {
    ackError(ack, 'Комната не найдена');
    return null;
  }
  if (room.hostId !== socket.data.user.id) {
    ackError(ack, 'Начать игру может только хост');
    return null;
  }
  if (room.status !== 'WAITING') {
    ackError(ack, 'Игра уже началась');
    return null;
  }
  if (room.participants.length < minPlayers) {
    ackError(ack, `Нужно минимум ${minPlayers} игрока`);
    return null;
  }
  if (room.participants.length > maxPlayers) {
    ackError(ack, 'Слишком много игроков');
    return null;
  }

  await prisma.gameRoom.update({
    where: { id: room.id },
    data: { status: 'PLAYING', startedAt: new Date() },
  });
  socket.join(CHANNEL(code));
  const runtime = makeRuntime(room);
  runtimes.set(code.toUpperCase(), runtime);
  ackOk(ack, { started: true, room: commonState(runtime) });
  return runtime;
}

async function roomForStart(code: string) {
  return prisma.gameRoom.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      game: true,
      participants: {
        include: { user: { select: { id: true, firstName: true, avatarUrl: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });
}

function membersFromRoom(room: NonNullable<Awaited<ReturnType<typeof roomForStart>>>): Map<string, Member> {
  return new Map(
    room.participants.map((participant) => [
      participant.id,
      {
        participantId: participant.id,
        userId: participant.userId ?? '',
        name: participant.user?.firstName ?? 'Игрок',
        avatarUrl: participant.user?.avatarUrl ?? null,
        score: participant.score,
        alive: true,
        lives: 1,
        connected: true,
      },
    ]),
  );
}

async function finishRuntime(
  io: Server,
  runtime: Runtime,
  ranked: Member[],
  winners: Set<string>,
  details: Record<string, unknown>,
) {
  if (runtime.finished) return;
  runtime.finished = true;
  runtime.phase = 'finished';
  clearTimers(runtime);

  try {
    await prisma.gameRoom.update({
      where: { id: runtime.roomId },
      data: { status: 'FINISHED', finishedAt: new Date() },
    });

    const rewards: Array<{ userId: string; xp: number; coins: number; place: number }> = [];
    for (let i = 0; i < ranked.length; i += 1) {
      const member = ranked[i];
      const place = i + 1;
      await prisma.gameParticipant.updateMany({
        where: { id: member.participantId },
        data: { score: member.score, rank: place },
      });
      if (!member.userId) continue;
      const xp = place === 1 ? 120 : place === 2 ? 80 : 55;
      const coins = place === 1 ? 30 : place === 2 ? 18 : 10;
      rewards.push({ userId: member.userId, xp, coins, place });
      await prisma.gameResult.upsert({
        where: { userId_roomId: { userId: member.userId, roomId: runtime.roomId } },
        create: {
          userId: member.userId,
          gameId: runtime.gameId,
          roomId: runtime.roomId,
          outcome: winners.size === 0 ? 'DRAW' : winners.has(member.userId) ? 'WIN' : 'LOSS',
          score: member.score,
          xpEarned: xp,
          coinsEarned: coins,
          details: details as Prisma.InputJsonValue,
        },
        update: {
          outcome: winners.size === 0 ? 'DRAW' : winners.has(member.userId) ? 'WIN' : 'LOSS',
          score: member.score,
          xpEarned: xp,
          coinsEarned: coins,
          details: details as Prisma.InputJsonValue,
        },
      });
      await awardRewards({
        userId: member.userId,
        xp,
        coins,
        type: 'GAME',
        description: `${gameTitle(runtime.slug)} · ${place} место`,
        reference: `mg:${runtime.slug}:${runtime.roomId}:${member.userId}`,
        metadata: { roomId: runtime.roomId, score: member.score, place },
      });
      await trackMetric(member.userId, 'GAMES_PLAYED', 1);
      if (winners.has(member.userId)) await trackMetric(member.userId, 'GAMES_WON', 1);
    }

    io.to(CHANNEL(runtime.code)).emit(`${runtime.prefix}:finished`, {
      gameSlug: runtime.slug,
      code: runtime.code,
      leaderboard: ranked.map((member, index) => ({
        ...memberDto(member),
        place: index + 1,
        isWinner: winners.has(member.userId),
      })),
      rewards,
      details,
    });
  } catch (error) {
    console.error(`[${runtime.slug}:finish]`, error);
  } finally {
    const key = runtime.code.toUpperCase();
    setTimeout(() => runtimes.delete(key), 60_000).unref();
  }
}

function gameTitle(slug: GameSlug) {
  if (slug === 'word-bomb') return 'Словесная бомба';
  if (slug === 'bluff-trivia') return 'Блеф-викторина';
  if (slug === 'converge') return 'На одной волне';
  if (slug === 'auction') return 'Аукцион';
  return 'Минное поле';
}

async function createLobby(
  io: Server,
  socket: Socket,
  slug: GameSlug,
  prefix: string,
  maxPlayers: number,
  ack?: unknown,
) {
  try {
    const userId = socket.data.user.id as string;
    const game = await prisma.game.findUnique({ where: { slug } });
    if (!game) return ackError(ack, 'Игра недоступна');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, avatarUrl: true },
    });
    if (!user) return ackError(ack, 'Пользователь не найден');

    let code = randomCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await prisma.gameRoom.findUnique({ where: { code } });
      if (!exists) break;
      code = randomCode();
    }

    const room = await prisma.gameRoom.create({
      data: {
        code,
        gameId: game.id,
        hostId: userId,
        isPrivate: true,
        maxPlayers,
        participants: { create: [{ userId }] },
      },
      select: { id: true, code: true },
    });
    socket.join(CHANNEL(code));
    const payload = await lobbyState(code);
    ackOk(ack, { room: payload });
    socket.emit(`${prefix}:state`, payload);
    return room;
  } catch (error) {
    console.error(`[${prefix}:create]`, error);
    return ackError(ack, 'Не удалось создать комнату');
  }
}

async function joinLobby(
  io: Server,
  socket: Socket,
  slug: GameSlug,
  prefix: string,
  codeRaw: string,
  ack?: unknown,
) {
  try {
    const code = codeRaw.toUpperCase();
    const room = await prisma.gameRoom.findUnique({
      where: { code },
      include: { participants: true, game: true },
    });
    if (!room || room.game.slug !== slug) return ackError(ack, 'Комната не найдена');
    if (room.status === 'FINISHED' || room.status === 'CANCELLED') return ackError(ack, 'Комната закрыта');
    const userId = socket.data.user.id as string;
    const existing = room.participants.find((participant) => participant.userId === userId);
    if (!existing && room.status === 'PLAYING') {
      return ackError(ack, 'Игра уже началась');
    }
    if (!existing && room.participants.length >= room.maxPlayers) return ackError(ack, 'Комната заполнена');
    if (!existing) {
      await prisma.gameParticipant.create({ data: { roomId: room.id, userId } });
    }
    socket.join(CHANNEL(code));
    const runtime = runtimes.get(code);
    if (runtime) {
      const member = [...runtime.members.values()].find((entry) => entry.userId === userId);
      if (member) member.connected = true;
      emitState(io, runtime, {});
    } else {
      const payload = await lobbyState(code);
      socket.emit(`${prefix}:state`, payload);
    }
    ackOk(ack, { joined: true });
  } catch (error) {
    console.error(`[${prefix}:join]`, error);
    ackError(ack, 'Не удалось войти в комнату');
  }
}

async function leaveLobby(io: Server, socket: Socket, prefix: string, codeRaw: string, ack?: unknown) {
  try {
    const code = codeRaw.toUpperCase();
    const userId = socket.data.user.id as string;
    const runtime = runtimes.get(code);
    if (runtime) {
      const member = [...runtime.members.values()].find((entry) => entry.userId === userId);
      if (member) {
        member.connected = false;
        emitState(io, runtime, {});
      }
      ackOk(ack, { left: true });
      return;
    }
    const room = await prisma.gameRoom.findUnique({ where: { code }, include: { participants: true } });
    if (!room) return ackOk(ack, { left: true });
    const participant = room.participants.find((entry) => entry.userId === userId);
    if (participant) {
      await prisma.gameParticipant.delete({ where: { id: participant.id } }).catch(() => {});
      const rest = room.participants.filter((entry) => entry.id !== participant.id);
      if (rest.length === 0) {
        await prisma.gameRoom.update({ where: { id: room.id }, data: { status: 'CANCELLED' } }).catch(() => {});
      } else if (room.hostId === userId) {
        await prisma.gameRoom.update({ where: { id: room.id }, data: { hostId: rest[0].userId! } }).catch(() => {});
      }
    }
    const payload = await lobbyState(code);
    if (payload) io.to(CHANNEL(code)).emit(`${prefix}:state`, payload);
    ackOk(ack, { left: true });
  } catch (error) {
    console.error(`[${prefix}:leave]`, error);
    ackError(ack, 'Не удалось выйти');
  }
}

function syncLobby(io: Server, socket: Socket, prefix: string, codeRaw: string) {
  const code = codeRaw.toUpperCase();
  const runtime = runtimes.get(code);
  if (runtime) {
    emitState(io, runtime, {});
    return;
  }
  void lobbyState(code).then((payload) => {
    if (payload) socket.emit(`${prefix}:state`, payload);
  });
}

// ─── Word Bomb ───────────────────────────────────────────────────────────────

function bombState(runtime: BombRuntime) {
  return {
    syllable: runtime.syllable,
    turnId: runtime.turnId,
    turnEndsAt: runtime.turnEndsAt,
    round: runtime.round,
    usedWords: [...runtime.used],
  };
}

function bombAlive(runtime: BombRuntime) {
  return [...runtime.members.values()].filter((member) => member.alive);
}

function bombNext(runtime: BombRuntime) {
  const alive = bombAlive(runtime);
  if (alive.length === 0) return null;
  const currentIndex = alive.findIndex((member) => member.participantId === runtime.turnId);
  return alive[(currentIndex + 1) % alive.length];
}

function bombSchedule(runtime: BombRuntime, io: Server) {
  clearTimers(runtime);
  const member = runtime.members.get(runtime.turnId);
  if (!member) return;
  const duration = randomInt(13, 22) + Math.min(4, runtime.round);
  runtime.turnEndsAt = Date.now() + duration * 1000;
  schedule(runtime, () => bombTimeout(runtime, io), duration * 1000);
}

function bombTimeout(runtime: BombRuntime, io: Server) {
  if (runtime.finished) return;
  const member = runtime.members.get(runtime.turnId);
  if (!member || !member.alive) {
    const next = bombNext(runtime);
    if (!next) return finishBomb(io, runtime);
    runtime.turnId = next.participantId;
    bombSchedule(runtime, io);
    emitState(io, runtime, bombState(runtime));
    return;
  }
  member.lives -= 1;
  if (member.lives <= 0) member.alive = false;
  runtime.round += 1;
  io.to(CHANNEL(runtime.code)).emit('bomb:exploded', {
    participantId: member.participantId,
    name: member.name,
    livesLeft: Math.max(0, member.lives),
  });
  const alive = bombAlive(runtime);
  if (alive.length <= 1) {
    void finishBomb(io, runtime);
    return;
  }
  const next = bombNext(runtime);
  if (!next) return finishBomb(io, runtime);
  runtime.turnId = next.participantId;
  bombSchedule(runtime, io);
  emitState(io, runtime, bombState(runtime));
}

function finishBomb(io: Server, runtime: BombRuntime) {
  const ranked = [...runtime.members.values()].sort(
    (a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score,
  );
  const winner = ranked.find((member) => member.alive);
  void finishRuntime(io, runtime, ranked, new Set(winner ? [winner.userId] : []), {
    game: 'word-bomb',
    syllable: runtime.syllable,
    rounds: runtime.round,
  });
}

function bombStart(io: Server, runtime: BombRuntime) {
  runtime.syllable = SYLLABLES[Math.floor(Math.random() * SYLLABLES.length)];
  runtime.round = 1;
  runtime.used = new Set();
  for (const member of runtime.members.values()) {
    member.lives = 3;
    member.alive = true;
  }
  const first = [...runtime.members.values()][0];
  runtime.turnId = first.participantId;
  runtime.phase = 'playing';
  bombSchedule(runtime, io);
  emitState(io, runtime, bombState(runtime));
}

// ─── Auction ─────────────────────────────────────────────────────────────────

function auctionState(runtime: AuctionRuntime) {
  const question = runtime.questions[runtime.questionIndex];
  return {
    round: runtime.questionIndex + 1,
    totalRounds: runtime.questions.length,
    question: { prompt: question.prompt },
    phaseEndsAt: runtime.phaseEndsAt,
    answeredCount: runtime.answers.size,
    totalPlayers: runtime.members.size,
  };
}

function auctionStartRound(runtime: AuctionRuntime, io: Server) {
  clearTimers(runtime);
  runtime.answers.clear();
  runtime.phase = 'input';
  runtime.phaseEndsAt = Date.now() + 15_000;
  schedule(runtime, () => auctionReveal(runtime, io), 15_000);
  emitState(io, runtime, auctionState(runtime));
}

function auctionReveal(runtime: AuctionRuntime, io: Server) {
  if (runtime.finished || runtime.phase !== 'input') return;
  clearTimers(runtime);
  runtime.phase = 'reveal';
  const question = runtime.questions[runtime.questionIndex];
  const correct = question.answer;

  const rows = [...runtime.members.values()].map((member) => {
    const answer = runtime.answers.get(member.userId);
    const over = answer === undefined || answer > correct;
    const distance = answer === undefined ? null : Math.abs(answer - correct);
    return { member, answer: answer ?? null, over, distance, exact: answer === correct };
  });
  const eligible = rows.filter((row) => !row.over && row.distance !== null);
  const bestDistance = eligible.length > 0 ? Math.min(...eligible.map((row) => row.distance as number)) : null;
  const deltas = new Map<string, number>();
  for (const row of rows) {
    if (row.over) {
      deltas.set(row.member.userId, 0);
      continue;
    }
    if (row.exact) deltas.set(row.member.userId, 1500);
    else if (row.distance === bestDistance) deltas.set(row.member.userId, 1000);
    else deltas.set(row.member.userId, 0);
  }
  for (const member of runtime.members.values()) {
    const delta = deltas.get(member.userId) ?? 0;
    member.score += delta;
  }
  runtime.phaseEndsAt = Date.now() + 8_000;
  schedule(runtime, () => {
    if (runtime.questionIndex + 1 >= runtime.questions.length) {
      const ranked = [...runtime.members.values()].sort((a, b) => b.score - a.score);
      const top = ranked[0]?.score ?? 0;
      void finishRuntime(
        io,
        runtime,
        ranked,
        eligible.length > 0
          ? new Set(ranked.filter((member) => member.score === top).map((member) => member.userId))
          : new Set(),
        { game: 'auction', rounds: runtime.questions.length },
      );
    } else {
      runtime.questionIndex += 1;
      auctionStartRound(runtime, io);
    }
  }, 8_000);

  emitState(io, runtime, {
    ...auctionState(runtime),
    phase: 'reveal',
    reveal: {
      correct,
      rows: rows.map((row) => ({
        participantId: row.member.participantId,
        name: row.member.name,
        answer: row.answer,
        over: row.over,
        correct: row.exact,
        points: deltas.get(row.member.userId) ?? 0,
      })),
    },
  });
}

function auctionStart(io: Server, runtime: AuctionRuntime) {
  runtime.questions = shuffle(AUCTION_QUESTIONS).slice(0, 5);
  runtime.questionIndex = 0;
  runtime.phase = 'input';
  auctionStartRound(runtime, io);
}

// ─── Bluff Trivia ────────────────────────────────────────────────────────────

function bluffState(runtime: BluffRuntime) {
  const base = {
    round: runtime.factIndex + 1,
    totalRounds: runtime.facts.length,
    prompt: runtime.fact.prompt,
    phaseEndsAt: runtime.phaseEndsAt,
    submittedCount: runtime.fakeAnswers.size,
    totalPlayers: runtime.members.size,
  };
  if (runtime.phase === 'voting') {
    return {
      ...base,
      options: runtime.options.map((option) => ({ id: option.id, text: option.text })),
      votedCount: runtime.votes.size,
    };
  }
  if (runtime.phase === 'reveal') {
    return {
      ...base,
      reveal: {
        correctAnswer: runtime.fact.answer,
        options: runtime.options.map((option) => ({
          id: option.id,
          text: option.text,
          authorId: option.authorId,
          authorName: option.authorId
            ? [...runtime.members.values()].find((member) => member.userId === option.authorId)?.name ?? 'Игрок'
            : null,
          correct: option.authorId === null,
        })),
      },
    };
  }
  return base;
}

function bluffBeginInput(runtime: BluffRuntime, io: Server) {
  clearTimers(runtime);
  runtime.phase = 'input';
  runtime.fakeAnswers.clear();
  runtime.votes.clear();
  runtime.options = [];
  runtime.phaseEndsAt = Date.now() + 30_000;
  schedule(runtime, () => bluffBeginVoting(runtime, io), 30_000);
  emitState(io, runtime, bluffState(runtime));
}

function bluffBeginVoting(runtime: BluffRuntime, io: Server) {
  if (runtime.finished || runtime.phase !== 'input') return;
  clearTimers(runtime);
  runtime.phase = 'voting';
  const options: BluffOption[] = [
    { id: `opt-${randomInt(100000, 999999)}`, text: runtime.fact.answer, authorId: null },
    ...shuffle([...runtime.fakeAnswers.entries()]).map(([userId, text], index) => ({
      id: `opt-${index}-${randomInt(100000, 999999)}`,
      text,
      authorId: userId,
    })),
  ];
  runtime.options = shuffle(options);
  runtime.votes.clear();
  runtime.phaseEndsAt = Date.now() + 20_000;
  schedule(runtime, () => bluffReveal(runtime, io), 20_000);
  emitState(io, runtime, bluffState(runtime));
}

function bluffReveal(runtime: BluffRuntime, io: Server) {
  if (runtime.finished || runtime.phase !== 'voting') return;
  clearTimers(runtime);
  runtime.phase = 'reveal';
  const deltas = new Map<string, number>();
  for (const member of runtime.members.values()) deltas.set(member.userId, 0);

  for (const [voterId, optionId] of runtime.votes) {
    const option = runtime.options.find((entry) => entry.id === optionId);
    if (!option) continue;
    if (option.authorId === null) {
      deltas.set(voterId, (deltas.get(voterId) ?? 0) + 1000);
    } else if (option.authorId) {
      deltas.set(option.authorId, (deltas.get(option.authorId) ?? 0) + 500);
    }
  }
  for (const member of runtime.members.values()) {
    member.score += deltas.get(member.userId) ?? 0;
  }
  runtime.phaseEndsAt = Date.now() + 10_000;
  schedule(runtime, () => {
    if (runtime.factIndex + 1 >= runtime.facts.length) {
      const ranked = [...runtime.members.values()].sort((a, b) => b.score - a.score);
      const top = ranked[0]?.score ?? 0;
      void finishRuntime(
        io,
        runtime,
        ranked,
        new Set(ranked.filter((member) => member.score === top).map((member) => member.userId)),
        { game: 'bluff-trivia', rounds: runtime.facts.length },
      );
    } else {
      runtime.factIndex += 1;
      runtime.fact = runtime.facts[runtime.factIndex];
      bluffBeginInput(runtime, io);
    }
  }, 10_000);

  const state = bluffState(runtime) as Record<string, unknown>;
  const reveal = (state.reveal as Record<string, unknown> | undefined) ?? {};
  emitState(io, runtime, {
    ...state,
    reveal: {
      ...reveal,
      points: [...runtime.members.values()].map((member) => ({
        userId: member.userId,
        name: member.name,
        points: deltas.get(member.userId) ?? 0,
      })),
      votes: [...runtime.votes.entries()].map(([voterId, optionId]) => ({
        voterId,
        voterName:
          [...runtime.members.values()].find((member) => member.userId === voterId)?.name ?? 'Игрок',
        optionId,
      })),
    },
  });
}

function bluffStart(io: Server, runtime: BluffRuntime) {
  runtime.facts = shuffle(BLUFF_FACTS).slice(0, 5);
  runtime.factIndex = 0;
  runtime.fact = runtime.facts[0];
  bluffBeginInput(runtime, io);
}

// ─── Converge ────────────────────────────────────────────────────────────────

function convergeState(runtime: ConvergeRuntime) {
  return {
    round: runtime.roundIndex + 1,
    totalRounds: 10,
    pair: runtime.rounds[runtime.roundIndex],
    phaseEndsAt: runtime.phaseEndsAt,
    submittedCount: runtime.answers.size,
    totalPlayers: runtime.members.size,
  };
}

function convergeBegin(runtime: ConvergeRuntime, io: Server) {
  clearTimers(runtime);
  runtime.phase = 'input';
  runtime.answers.clear();
  runtime.phaseEndsAt = Date.now() + 20_000;
  schedule(runtime, () => convergeReveal(runtime, io), 20_000);
  emitState(io, runtime, convergeState(runtime));
}

function convergeReveal(runtime: ConvergeRuntime, io: Server) {
  if (runtime.finished || runtime.phase !== 'input') return;
  clearTimers(runtime);
  runtime.phase = 'reveal';
  const pair = runtime.rounds[runtime.roundIndex];
  const rows = [...runtime.members.values()].map((member) => ({
    userId: member.userId,
    name: member.name,
    answer: runtime.answers.get(member.userId) ?? null,
  }));
  const normalized = rows.map((row) => (row.answer ? normalize(row.answer) : ''));
  const matched = normalized[0] !== '' && normalized[0] === normalized[1];
  runtime.phaseEndsAt = Date.now() + 6_000;

  if (matched) {
    for (const member of runtime.members.values()) member.score += 1000;
    schedule(runtime, () => {
      const ranked = [...runtime.members.values()].sort((a, b) => b.score - a.score);
      void finishRuntime(io, runtime, ranked, new Set(ranked.map((member) => member.userId)), {
        game: 'converge',
        rounds: runtime.roundIndex + 1,
        matched,
      });
    }, 6000);
  } else {
    schedule(runtime, () => {
      if (runtime.roundIndex + 1 >= 10) {
        const ranked = [...runtime.members.values()].sort((a, b) => b.score - a.score);
        void finishRuntime(io, runtime, ranked, new Set(), {
          game: 'converge',
          rounds: 10,
          matched: false,
        });
      } else {
        runtime.roundIndex += 1;
        if (normalized[0] && normalized[1]) {
          runtime.rounds[runtime.roundIndex] = [normalized[0], normalized[1]];
        }
        convergeBegin(runtime, io);
      }
    }, 6000);
  }

  emitState(io, runtime, {
    ...convergeState(runtime),
    phase: 'reveal',
    reveal: { pair, rows, matched },
  });
}

function convergeStart(io: Server, runtime: ConvergeRuntime) {
  runtime.roundIndex = 0;
  runtime.rounds = [shuffle(CONVERGE_PAIRS)[0]];
  convergeBegin(runtime, io);
}

// ─── Minefield ───────────────────────────────────────────────────────────────

function mineState(runtime: MineRuntime) {
  return {
    category: runtime.category,
    turnId: runtime.turnId,
    turnEndsAt: runtime.turnEndsAt,
    cards: runtime.cards.map((card) => ({
      id: card.id,
      label: card.label,
      revealed: card.revealed,
      isMine: card.revealed ? card.isMine : undefined,
    })),
    safeLeft: runtime.cards.filter((card) => !card.isMine && !card.revealed).length,
  };
}

function mineAlive(runtime: MineRuntime) {
  return [...runtime.members.values()].filter((member) => member.alive);
}

function mineNext(runtime: MineRuntime) {
  const alive = mineAlive(runtime);
  const current = alive.findIndex((member) => member.participantId === runtime.turnId);
  return alive[(current + 1) % alive.length];
}

function mineSchedule(runtime: MineRuntime, io: Server) {
  clearTimers(runtime);
  runtime.turnEndsAt = Date.now() + 10_000;
  schedule(runtime, () => {
    const next = mineNext(runtime);
    if (!next) return finishMine(io, runtime);
    runtime.turnId = next.participantId;
    mineSchedule(runtime, io);
    emitState(io, runtime, { ...mineState(runtime), timeout: true });
  }, 10_000);
}

function finishMine(io: Server, runtime: MineRuntime) {
  const alive = mineAlive(runtime);
  const ranked = [...runtime.members.values()].sort((a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score);
  const winner = alive.length === 1 ? alive[0] : ranked.find((member) => member.score === ranked[0]?.score);
  void finishRuntime(io, runtime, ranked, new Set(winner ? [winner.userId] : []), {
    game: 'minefield',
    category: runtime.category,
  });
}

// ─── Game startup ────────────────────────────────────────────────────────────

const LOBBY: Array<{ slug: GameSlug; prefix: string; min: number; max: number }> = [
  { slug: 'word-bomb', prefix: 'bomb', min: 2, max: 8 },
  { slug: 'bluff-trivia', prefix: 'bluff', min: 3, max: 8 },
  { slug: 'converge', prefix: 'converge', min: 2, max: 2 },
  { slug: 'auction', prefix: 'auction', min: 2, max: 10 },
  { slug: 'minefield', prefix: 'mine', min: 2, max: 6 },
];

export function attachMinigames(io: Server) {
  gameIo = io;
  io.on('connection', (socket: Socket) => {
    for (const config of LOBBY) {
      const { slug, prefix } = config;

      socket.on(`${prefix}:create`, (payload: unknown, ack?: unknown) => {
        const data = payload as { maxPlayers?: number };
        const max = Math.min(config.max, Math.max(config.min, Number(data?.maxPlayers) || config.max));
        void createLobby(io, socket, slug, prefix, max, ack);
      });

      socket.on(`${prefix}:join`, (payload: unknown, ack?: unknown) => {
        const data = payload as { code?: string };
        if (!data?.code) return ackError(ack, 'Введите код комнаты');
        void joinLobby(io, socket, slug, prefix, String(data.code), ack);
      });

      socket.on(`${prefix}:leave`, (payload: unknown, ack?: unknown) => {
        const data = payload as { code?: string };
        if (data?.code) void leaveLobby(io, socket, prefix, String(data.code), ack);
        else ackOk(ack, { left: true });
      });

      socket.on(`${prefix}:sync`, (payload: unknown) => {
        const data = payload as { code?: string };
        if (data?.code) syncLobby(io, socket, prefix, String(data.code));
      });

      socket.on(`${prefix}:start`, async (payload: unknown, ack?: unknown) => {
        const data = payload as { code?: string };
        if (!data?.code) return ackError(ack, 'Комната не найдена');
        const code = String(data.code).toUpperCase();

        if (slug === 'word-bomb') {
          const runtime = await startRoom(io, socket, code, slug, config.min, config.max, (room) =>
            ({
              roomId: room.id,
              gameId: room.gameId,
              code: room.code,
              slug,
              prefix,
              hostId: room.hostId,
              phase: 'playing',
              members: membersFromRoom(room),
              timers: new Set(),
              finished: false,
              syllable: '',
              turnId: '',
              turnEndsAt: 0,
              used: new Set(),
              round: 0,
            } satisfies BombRuntime), ack);
          if (runtime) bombStart(io, runtime as BombRuntime);
        } else if (slug === 'auction') {
          const runtime = await startRoom(io, socket, code, slug, config.min, config.max, (room) =>
            ({
              roomId: room.id,
              gameId: room.gameId,
              code: room.code,
              slug,
              prefix,
              hostId: room.hostId,
              phase: 'input',
              members: membersFromRoom(room),
              timers: new Set(),
              finished: false,
              questions: [],
              questionIndex: 0,
              phaseEndsAt: 0,
              answers: new Map(),
            } satisfies AuctionRuntime), ack);
          if (runtime) auctionStart(io, runtime as AuctionRuntime);
        } else if (slug === 'bluff-trivia') {
          const runtime = await startRoom(io, socket, code, slug, config.min, config.max, (room) =>
            ({
              roomId: room.id,
              gameId: room.gameId,
              code: room.code,
              slug,
              prefix,
              hostId: room.hostId,
              phase: 'input',
              members: membersFromRoom(room),
              timers: new Set(),
              finished: false,
              facts: [],
              factIndex: 0,
              fact: { prompt: '', answer: '' },
              phaseEndsAt: 0,
              fakeAnswers: new Map(),
              votes: new Map(),
              options: [],
            } satisfies BluffRuntime), ack);
          if (runtime) bluffStart(io, runtime as BluffRuntime);
        } else if (slug === 'converge') {
          const runtime = await startRoom(io, socket, code, slug, config.min, config.max, (room) =>
            ({
              roomId: room.id,
              gameId: room.gameId,
              code: room.code,
              slug,
              prefix,
              hostId: room.hostId,
              phase: 'input',
              members: membersFromRoom(room),
              timers: new Set(),
              finished: false,
              rounds: [],
              roundIndex: 0,
              phaseEndsAt: 0,
              answers: new Map(),
            } satisfies ConvergeRuntime), ack);
          if (runtime) convergeStart(io, runtime as ConvergeRuntime);
        } else {
          const runtime = await startRoom(io, socket, code, slug, config.min, config.max, (room) => {
            const category = MINEFIELD_CATEGORIES[Math.floor(Math.random() * MINEFIELD_CATEGORIES.length)];
            const cards: MineCard[] = shuffle(category.items.slice(0, 16)).map((label, index) => ({
              id: `card-${index}`,
              label,
              isMine: false,
              revealed: false,
            }));
            for (const index of shuffle(cards.map((_, i) => i)).slice(0, 4)) cards[index].isMine = true;
            return {
              roomId: room.id,
              gameId: room.gameId,
              code: room.code,
              slug,
              prefix,
              hostId: room.hostId,
              phase: 'playing',
              members: membersFromRoom(room),
              timers: new Set(),
              finished: false,
              category: category.category,
              cards,
              turnId: '',
              turnEndsAt: 0,
            } satisfies MineRuntime;
          }, ack);
          if (runtime) {
            const mine = runtime as MineRuntime;
            mine.turnId = [...mine.members.values()][0].participantId;
            mineSchedule(mine, io);
            emitState(io, mine, mineState(mine));
          }
        }
      });
    }

    socket.on('bomb:submit', (payload: unknown, ack?: unknown) => {
      const data = payload as { word?: string; code?: string };
      const runtime = data.code
        ? (runtimes.get(data.code.toUpperCase()) as BombRuntime | undefined) ?? null
        : findRuntimeByUser<BombRuntime>('word-bomb', socket.data.user.id);
      void handleBombSubmit(runtime?.code, socket, data?.word ?? '', ack);
    });

    socket.on('auction:answer', (payload: unknown, ack?: unknown) => {
      const data = payload as { value?: number; answer?: number; code?: string };
      void handleAuctionAnswer(socket, data, ack);
    });

    socket.on('bluff:input', (payload: unknown, ack?: unknown) => {
      const data = payload as { text?: string; code?: string };
      void handleBluffInput(socket, data?.text ?? '', data?.code, ack);
    });

    socket.on('bluff:vote', (payload: unknown, ack?: unknown) => {
      const data = payload as { optionId?: string; code?: string };
      void handleBluffVote(socket, data?.optionId ?? '', data?.code, ack);
    });

    socket.on('converge:answer', (payload: unknown, ack?: unknown) => {
      const data = payload as { word?: string; code?: string };
      void handleConvergeAnswer(socket, data?.word ?? '', data?.code, ack);
    });

    socket.on('mine:pick', (payload: unknown, ack?: unknown) => {
      const data = payload as { cardId?: string; code?: string };
      void handleMinePick(socket, data?.cardId ?? '', data?.code, ack);
    });

    socket.on('disconnect', () => {
      for (const runtime of runtimes.values()) {
        const member = [...runtime.members.values()].find((entry) => entry.userId === socket.data.user.id);
        if (!member) continue;
        member.connected = false;
        emitState(io, runtime, {});
      }
    });
  });
}

function findRuntimeByUser<T extends Runtime>(slug: GameSlug, userId: string): T | null {
  for (const runtime of runtimes.values()) {
    if (runtime.slug !== slug) continue;
    if ([...runtime.members.values()].some((member) => member.userId === userId)) return runtime as T;
  }
  return null;
}

async function handleBombSubmit(code: string | undefined, socket: Socket, raw: string, ack?: unknown) {
  const runtime = (code ? runtimes.get(code.toUpperCase()) : null) as BombRuntime | null;
  if (!runtime || runtime.finished) return ackError(ack, 'Игра не найдена');
  const member = [...runtime.members.values()].find((entry) => entry.userId === socket.data.user.id);
  if (!member) return ackError(ack, 'Вы не в игре');
  if (!member.alive) return ackError(ack, 'Вы выбыли');
  if (member.participantId !== runtime.turnId) return ackError(ack, 'Сейчас не ваш ход');
  const word = wordNormalize(raw);
  if (word.length < 3) return ackError(ack, 'Слишком короткое слово');
  if (!DICTIONARY.has(word)) return ackError(ack, 'Такого слова нет в словаре');
  if (!word.includes(runtime.syllable.toLowerCase())) return ackError(ack, `В слове должен быть слог «${runtime.syllable}»`);
  if (runtime.used.has(word)) return ackError(ack, 'Это слово уже называли');
  const io = getIo();
  if (!io) return ackError(ack, 'Игровой сервер недоступен');
  runtime.used.add(word);
  member.score += 100 + Math.min(100, word.length * 10);
  runtime.round += 1;

  const next = bombNext(runtime);
  if (!next) return finishBomb(io, runtime);
  runtime.turnId = next.participantId;
  ackOk(ack, { accepted: true, points: 100 + Math.min(100, word.length * 10) });
  io.to(CHANNEL(runtime.code)).emit('bomb:accepted', {
    participantId: member.participantId,
    word,
    score: member.score,
  });
  bombSchedule(runtime, io);
  emitState(io, runtime, bombState(runtime));
}

function getIo(): Server | null {
  return gameIo;
}

async function handleAuctionAnswer(
  socket: Socket,
  data: { value?: number; answer?: number; code?: string },
  ack?: unknown,
) {
  const runtime = data.code
    ? ((runtimes.get(data.code.toUpperCase()) as AuctionRuntime | undefined) ?? null)
    : findRuntimeByUser<AuctionRuntime>('auction', socket.data.user.id);
  if (!runtime || runtime.finished) return ackError(ack, 'Игра не найдена');
  if (runtime.phase !== 'input') return ackError(ack, 'Ответы больше не принимаются');
  const member = [...runtime.members.values()].find((entry) => entry.userId === socket.data.user.id);
  if (!member) return ackError(ack, 'Вы не в игре');
  const value = Number(data.value ?? data.answer);
  if (!Number.isFinite(value)) return ackError(ack, 'Введите число');
  if (runtime.answers.has(member.userId)) return ackError(ack, 'Ответ уже отправлен');
  runtime.answers.set(member.userId, Math.round(value));
  ackOk(ack, { accepted: true });
  const io = getIo();
  if (!io) return;
  if (runtime.answers.size >= runtime.members.size) auctionReveal(runtime, io);
  else emitState(io, runtime, auctionState(runtime));
}

async function handleBluffInput(socket: Socket, raw: string, code?: string, ack?: unknown) {
  const runtime = code
    ? ((runtimes.get(code.toUpperCase()) as BluffRuntime | undefined) ?? null)
    : findRuntimeByUser<BluffRuntime>('bluff-trivia', socket.data.user.id);
  if (!runtime || runtime.finished) return ackError(ack, 'Игра не найдена');
  if (runtime.phase !== 'input') return ackError(ack, 'Приём ответов закончен');
  const member = [...runtime.members.values()].find((entry) => entry.userId === socket.data.user.id);
  if (!member) return ackError(ack, 'Вы не в игре');
  const text = raw.trim().slice(0, 80);
  if (text.length < 2) return ackError(ack, 'Слишком короткий вариант');
  if (normalize(text) === normalize(runtime.fact.answer)) return ackError(ack, 'Это правильный ответ — придумай другой');
  if (runtime.fakeAnswers.has(member.userId)) return ackError(ack, 'Вариант уже отправлен');
  runtime.fakeAnswers.set(member.userId, text);
  ackOk(ack, { accepted: true });
  const io = getIo();
  if (!io) return;
  if (runtime.fakeAnswers.size >= runtime.members.size) bluffBeginVoting(runtime, io);
  else emitState(io, runtime, bluffState(runtime));
}

async function handleBluffVote(socket: Socket, optionId: string, code?: string, ack?: unknown) {
  const runtime = code
    ? ((runtimes.get(code.toUpperCase()) as BluffRuntime | undefined) ?? null)
    : findRuntimeByUser<BluffRuntime>('bluff-trivia', socket.data.user.id);
  if (!runtime || runtime.finished) return ackError(ack, 'Игра не найдена');
  if (runtime.phase !== 'voting') return ackError(ack, 'Голосование закрыто');
  const member = [...runtime.members.values()].find((entry) => entry.userId === socket.data.user.id);
  if (!member) return ackError(ack, 'Вы не в игре');
  const option = runtime.options.find((entry) => entry.id === optionId);
  if (!option) return ackError(ack, 'Вариант не найден');
  if (option.authorId === member.userId) return ackError(ack, 'Нельзя голосовать за свой вариант');
  if (runtime.votes.has(member.userId)) return ackError(ack, 'Голос уже учтён');
  runtime.votes.set(member.userId, optionId);
  ackOk(ack, { accepted: true });
  const io = getIo();
  if (!io) return;
  if (runtime.votes.size >= runtime.members.size) bluffReveal(runtime, io);
  else emitState(io, runtime, bluffState(runtime));
}

async function handleConvergeAnswer(socket: Socket, raw: string, code?: string, ack?: unknown) {
  const runtime = code
    ? ((runtimes.get(code.toUpperCase()) as ConvergeRuntime | undefined) ?? null)
    : findRuntimeByUser<ConvergeRuntime>('converge', socket.data.user.id);
  if (!runtime || runtime.finished) return ackError(ack, 'Игра не найдена');
  if (runtime.phase !== 'input') return ackError(ack, 'Ответы больше не принимаются');
  const member = [...runtime.members.values()].find((entry) => entry.userId === socket.data.user.id);
  if (!member) return ackError(ack, 'Вы не в игре');
  const text = raw.trim().slice(0, 40);
  if (normalize(text).length < 2) return ackError(ack, 'Введите ассоциацию');
  if (runtime.answers.has(member.userId)) return ackError(ack, 'Ответ уже отправлен');
  runtime.answers.set(member.userId, text);
  ackOk(ack, { accepted: true });
  const io = getIo();
  if (!io) return;
  if (runtime.answers.size >= runtime.members.size) convergeReveal(runtime, io);
  else emitState(io, runtime, convergeState(runtime));
}

async function handleMinePick(socket: Socket, cardId: string, code?: string, ack?: unknown) {
  const runtime = code
    ? ((runtimes.get(code.toUpperCase()) as MineRuntime | undefined) ?? null)
    : findRuntimeByUser<MineRuntime>('minefield', socket.data.user.id);
  if (!runtime || runtime.finished) return ackError(ack, 'Игра не найдена');
  if (runtime.phase !== 'playing') return ackError(ack, 'Раунд окончен');
  const member = [...runtime.members.values()].find((entry) => entry.userId === socket.data.user.id);
  if (!member || !member.alive) return ackError(ack, 'Вы не в игре');
  if (member.participantId !== runtime.turnId) return ackError(ack, 'Сейчас не ваш ход');
  const card = runtime.cards.find((entry) => entry.id === cardId);
  if (!card || card.revealed) return ackError(ack, 'Карточка уже открыта');
  card.revealed = true;
  const io = getIo();
  if (!io) return ackError(ack, 'Игровой сервер недоступен');
  ackOk(ack, { accepted: true, hitMine: card.isMine, points: card.isMine ? 0 : 100 });
  if (card.isMine) {
    member.alive = false;
    io.to(CHANNEL(runtime.code)).emit('mine:explosion', {
      participantId: member.participantId,
      name: member.name,
      cardId: card.id,
    });
    if (mineAlive(runtime).length <= 1) return finishMine(io, runtime);
  } else {
    member.score += 100;
  }
  if (!runtime.cards.some((entry) => !entry.isMine && !entry.revealed)) {
    return finishMine(io, runtime);
  }
  const next = mineNext(runtime);
  if (!next) return finishMine(io, runtime);
  runtime.turnId = next.participantId;
  mineSchedule(runtime, io);
  emitState(io, runtime, mineState(runtime));
}
