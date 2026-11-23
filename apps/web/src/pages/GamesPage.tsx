import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Clock3,
  DoorOpen,
  Gamepad2,
  History,
  KeyRound,
  Swords,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { Game, GameResult } from '../types';
import { haptic } from '../lib/telegram';
import { cn, formatNumber, timeAgo } from '../lib/utils';
import { Avatar, Badge, Button, Card, EmptyState, Input, PageSkeleton, SectionHeader } from '../components/ui';

const gamePaths: Record<string, string> = {
  'quiz-battle': '/games/quiz',
  'word-duel': '/games/word-duel',
  'would-you-rather': '/games/wyr',
  'guess-image': '/games/image',
  'word-bomb': '/games/word-bomb',
  'bluff-trivia': '/games/bluff-trivia',
  converge: '/games/converge',
  auction: '/games/auction',
  minefield: '/games/minefield',
};

const features: Record<string, string[]> = {
  'quiz-battle': ['Живые комнаты', 'Друзья и публичные лобби', 'Таймер и очки'],
  'word-duel': ['90 секунд', 'Словарь 100k', 'Дуэль 1×1'],
  'would-you-rather': ['Статистика', 'Свои вопросы', 'Быстрые раунды'],
  'guess-image': ['3 попытки', 'Подсказки', 'Красивые фото'],
  'word-bomb': ['3 жизни', 'Скрытый таймер', '2–8 игроков'],
  'bluff-trivia': ['5 раундов', 'Блеф и голосование', '3–8 игроков'],
  converge: ['10 раундов', 'Ассоциации', 'Дуэль 1×1'],
  auction: ['5 раундов', 'Числа', '2–10 игроков'],
  minefield: ['16 карточек', '4 мины', '2–6 игроков'],
};

export function GamesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');

  const { data: games, isLoading } = useQuery({
    queryKey: ['games'],
    queryFn: async () => (await api.get('/games')).data.data as Game[],
  });
  const { data: history } = useQuery({
    queryKey: ['games', 'history'],
    queryFn: async () => (await api.get('/games/history')).data.data as GameResult[],
  });
  const { data: rooms } = useQuery({
    queryKey: ['quiz', 'public-rooms'],
    queryFn: async () =>
      (await api.get('/games/quiz/rooms')).data.data as Array<{
        id: string;
        code: string;
        host: { firstName: string; username: string | null; avatarUrl: string | null; level: number };
        participants: Array<{ id: string; userId: string | null; isBot: boolean }>;
        category?: { name: string; icon: string | null } | null;
        maxPlayers: number;
      }>,
    refetchInterval: 20_000,
  });

  const join = (roomCode: string) => {
    if (roomCode.trim().length < 4) {
      toast.error('Введите код комнаты');
      return;
    }
    haptic('selection');
    navigate(`/games/quiz?code=${roomCode.trim().toUpperCase()}`);
  };

  if (isLoading) {
    return (
      <div className="px-4 pt-3">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-7 px-4 pt-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300/70">
          <Gamepad2 size={13} /> Игровая зона
        </div>
        <h1 className="mt-1.5 font-display text-[26px] font-semibold leading-tight tracking-tight">
          Играй. Побеждай.
          <br />
          <span className="text-gradient">Поднимайся в топ.</span>
        </h1>
        <p className="mt-2 max-w-md text-[12px] leading-relaxed text-muted">
          Девять режимов, живые соперники и награды за каждую игру. Выбери быстрый матч или собери друзей в комнате.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {games?.map((game, index) => (
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className={cn(
              'group relative overflow-hidden rounded-[28px] border border-white/[0.1] p-4 shadow-card',
              index === 0 && 'col-span-2',
            )}
            style={{ background: game.gradient }}
          >
            <div className="pointer-events-none absolute -right-6 -top-8 text-[100px] opacity-[0.13]">{game.icon}</div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/[0.04]" />
            <div className={cn('relative flex h-full flex-col', index === 0 ? 'min-h-[186px]' : 'min-h-[166px]')}>
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-xl backdrop-blur">
                  {game.icon}
                </span>
                <span className="flex items-center gap-1 rounded-full border border-white/15 bg-black/20 px-2 py-1 text-[9px] font-semibold text-white/75 backdrop-blur">
                  <span className="h-1 w-1 rounded-full bg-emerald-300" />
                  {game.activePlayers ?? 0} онлайн
                </span>
              </div>
              <div className="mt-auto pt-5">
                <h2 className="font-display text-lg font-semibold text-white">{game.title}</h2>
                <p className="mt-0.5 text-[11px] font-medium text-white/60">{game.subtitle}</p>
                {index === 0 && (
                  <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-white/55">{game.description}</p>
                )}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {features[game.slug]?.map((feature) => (
                    <span key={feature} className="rounded-full bg-black/20 px-2 py-0.5 text-[9px] font-medium text-white/70">
                      {feature}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    navigate(gamePaths[game.slug] ?? '/games');
                  }}
                  className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[11px] font-bold text-slate-900 shadow-lg transition active:scale-95"
                >
                  {game.playedByMe ? 'Играть снова' : 'Играть'} <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/15 text-violet-300">
            <KeyRound size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-primary">Войти по коду комнаты</h3>
            <p className="mt-0.5 text-[11px] text-muted">Друг прислал код? Введите его, чтобы присоединиться.</p>
            <div className="mt-3 flex gap-2">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="FUN7QX"
                className="h-10 text-center font-mono text-sm font-bold tracking-[0.25em] uppercase"
                maxLength={6}
                aria-label="Код комнаты"
              />
              <Button size="md" onClick={() => join(code)} className="shrink-0">
                Войти
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <section>
        <SectionHeader
          title="Открытые комнаты"
          subtitle="Публичные лобби Quiz Battle"
          action={<Badge tone="emerald">{rooms?.length ?? 0} live</Badge>}
        />
        {rooms && rooms.length > 0 ? (
          <div className="space-y-2">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => join(room.code)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface/60 p-3 text-left transition hover:border-violet-400/30"
              >
                <Avatar user={room.host} size={40} online />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-primary">
                    {room.host.username ? `@${room.host.username}` : room.host.firstName}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {room.category?.icon ?? '⚡'} {room.category?.name ?? 'Общая категория'} · код {room.code}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted">
                  <Users size={12} />
                  {room.participants.length}/{room.maxPlayers}
                </div>
                <span className="rounded-xl bg-violet-500/15 px-2.5 py-1.5 text-[10px] font-bold text-violet-300">
                  Войти
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Card className="p-2">
            <EmptyState
              icon="🎲"
              title="Пока нет открытых комнат"
              text="Создайте публичную комнату и позовите друга — матч начнётся, когда присоединится второй игрок."
              className="py-8"
              action={<Button onClick={() => navigate('/games/quiz')}>Создать комнату</Button>}
            />
          </Card>
        )}
      </section>

      <section className="pb-2">
        <SectionHeader title="История матчей" subtitle="Последние результаты" action={<History size={16} className="text-muted" />} />
        {history && history.length > 0 ? (
          <Card className="divide-y divide-line/60 overflow-hidden">
            {history.slice(0, 6).map((result) => (
              <div key={result.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl text-base',
                    result.outcome === 'WIN' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.05] text-muted',
                  )}
                >
                  {result.outcome === 'WIN' ? <Trophy size={16} /> : <Swords size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-primary">
                    {result.room?.game?.title ?? 'Игра'}
                  </p>
                  <p className="flex items-center gap-1 text-[10px] text-muted">
                    <Clock3 size={9} /> {timeAgo(result.createdAt)} · {formatNumber(result.score)} очков
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn('text-[11px] font-bold', result.outcome === 'WIN' ? 'text-emerald-300' : 'text-muted')}>
                    {result.outcome === 'WIN' ? 'Победа' : 'Участие'}
                  </p>
                  <p className="text-[10px] text-violet-300">+{result.xpEarned} XP</p>
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="p-2">
            <EmptyState
              icon="🏁"
              title="Матчей пока нет"
              text="Сыграйте первую игру — результат сохранится здесь."
              className="py-8"
            />
          </Card>
        )}
      </section>
    </div>
  );
}
