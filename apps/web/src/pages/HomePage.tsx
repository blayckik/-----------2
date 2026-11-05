import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Coins,
  Flame,
  Gamepad2,
  Gift,
  Sparkles,
  Target,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import {
  cn,
  formatCompact,
  formatNumber,
  plural,
  timeAgo,
  userName,
  formatTimeLeft,
} from '../lib/utils';
import type { Dashboard, Event } from '../types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  Progress,
  SectionHeader,
} from '../components/ui';

const quickActions = [
  { to: '/quests', label: 'Задания', icon: Target, color: 'from-amber-400/20 to-orange-500/10', iconColor: 'text-amber-300' },
  { to: '/friends', label: 'Друзья', icon: UserPlus, color: 'from-emerald-400/20 to-teal-500/10', iconColor: 'text-emerald-300' },
  { to: '/wallet', label: 'Кошелёк', icon: Wallet, color: 'from-sky-400/20 to-blue-500/10', iconColor: 'text-sky-300' },
  { to: '/achievements', label: 'Достижения', icon: Trophy, color: 'from-fuchsia-400/20 to-pink-500/10', iconColor: 'text-fuchsia-300' },
];

export function HomePage() {
  const { me, refreshMe } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер');
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/dashboard')).data.data as Dashboard,
  });

  const claimDaily = useMutation({
    mutationFn: async () => (await api.post('/wallet/daily')).data.data,
    onSuccess: (result) => {
      haptic('success');
      toast.success(`Награда получена: +${result.xp} XP и +${result.coins} FUN Coins`);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void refreshMe();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const claimQuest = useMutation({
    mutationFn: async (id: string) => (await api.post(`/quests/${id}/claim`)).data.data,
    onSuccess: (result) => {
      haptic('success');
      toast.success(`Задание выполнено: +${result.xp} XP, +${result.coins} coins`);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      void refreshMe();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const dailyQuest = useMemo(
    () =>
      data?.dailyQuests.find((quest) => quest.completedAt && !quest.claimedAt) ??
      data?.dailyQuests.find((quest) => !quest.claimedAt) ??
      data?.dailyQuests[0],
    [data?.dailyQuests],
  );

  if (isLoading) {
    return (
      <div className="px-4 pt-3">
        <PageSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 pt-6">
        <Card className="p-2">
          <EmptyState
            icon="📡"
            title="Не удалось загрузить ленту"
            text="Проверьте соединение и попробуйте снова."
            action={<Button onClick={() => refetch()}>Повторить</Button>}
          />
        </Card>
      </div>
    );
  }

  const { user, level } = data;
  const displayName = user.profile?.displayName || user.firstName;
  const rank = data.topPlayers.findIndex((player) => player.id === user.id) + 1;

  return (
    <div className="space-y-7 px-4 pt-3">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-[30px] border border-white/[0.11] bg-gradient-to-br from-[#251a4d]/95 via-[#17122f]/95 to-[#0d0c1b]/95 p-5 shadow-[0_30px_80px_-30px_rgba(99,102,241,.55)]"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/30 blur-[70px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-52 rounded-full bg-fuchsia-500/20 blur-[70px]" />
        <div className="pointer-events-none absolute right-6 top-4 text-[120px] opacity-[0.055]">🎮</div>

        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <Avatar user={user} size={62} ring />
              <span className="absolute -bottom-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-amber-300 to-orange-500 px-1 text-[10px] font-black text-amber-950 shadow-lg">
                {level.level}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-200/70">
                {greeting}
              </p>
              <h1 className="font-display text-[22px] font-semibold leading-tight text-white">
                {displayName}
              </h1>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-violet-100/65">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.9)]" />
                {data.onlineNow} {plural(data.onlineNow, 'игрок', 'игрока', 'игроков')} онлайн
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/notifications')}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-violet-100/80 transition hover:bg-white/10"
          >
            <Bell size={17} />
            {data.unreadNotifications > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[8px] font-black text-white">
                {data.unreadNotifications}
              </span>
            )}
          </button>
        </div>

        <div className="relative mt-4 rounded-2xl border border-white/[0.08] bg-black/15 p-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-violet-100/80">Уровень {level.level}</span>
            <span className="text-violet-100/50">
              {formatNumber(level.current)} / {formatNumber(level.needed)} XP
            </span>
          </div>
          <Progress value={level.current} max={level.needed} height={7} />
          <div className="mt-1.5 text-right text-[10px] text-violet-100/40">
            до {level.level + 1} уровня — {formatNumber(level.needed - level.current)} XP
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <HeroStat icon={<Coins size={14} />} value={formatCompact(user.coins)} label="FUN Coins" />
          <HeroStat icon={<Users size={14} />} value={String(data.friendsCount)} label="Друзей" />
          <HeroStat icon={<Trophy size={14} />} value={rank ? `#${rank}` : '—'} label="В топе" />
        </div>

        {data.dailyAvailable && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => claimDaily.mutate()}
            disabled={claimDaily.isPending}
            className="relative mt-4 flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-400/20 via-orange-400/15 to-rose-400/10 p-3 text-left"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 text-xl shadow-lg">
              🎁
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-amber-100">Ежедневная награда</span>
              <span className="block text-[11px] text-amber-100/60">
                {data.dailyDay > 0 ? `Серия ${data.dailyDay} дней · ` : ''}заберите бонус дня
              </span>
            </span>
            <span className="rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white">
              {claimDaily.isPending ? '…' : 'Забрать'}
            </span>
          </motion.button>
        )}
      </motion.section>

      <section>
        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((action, index) => (
            <motion.button
              key={action.to}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * index }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                haptic('selection');
                navigate(action.to);
              }}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface/60 px-1.5 py-3 transition hover:border-white/20"
            >
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br', action.color, action.iconColor)}>
                <action.icon size={17} />
              </span>
              <span className="text-[10px] font-semibold text-muted group-hover:text-primary">{action.label}</span>
            </motion.button>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Играй сейчас"
          subtitle={`${data.popularGames.reduce((total, game) => total + (game.activePlayers ?? 0), 0)} игроков в игре`}
          action={
            <Link to="/games" className="flex items-center gap-1 text-[11px] font-semibold text-violet-300">
              Все игры <ChevronRight size={13} />
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3">
          {data.popularGames.map((game, index) => (
            <motion.button
              key={game.id}
              type="button"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
              whileTap={{ scale: 0.975 }}
              onClick={() => {
                haptic('light');
                const path =
                  game.slug === 'quiz-battle'
                    ? '/games/quiz'
                    : game.slug === 'word-duel'
                      ? '/games/word-duel'
                      : game.slug === 'would-you-rather'
                        ? '/games/wyr'
                        : '/games/image';
                navigate(path);
              }}
              className="group relative overflow-hidden rounded-3xl border border-white/[0.1] p-4 text-left shadow-card"
              style={{ background: game.gradient }}
            >
              <div className="absolute -right-4 -top-5 text-[72px] opacity-[0.16] transition group-hover:scale-110">
                {game.icon}
              </div>
              <div className="relative flex h-full min-h-[132px] flex-col">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-lg backdrop-blur-md">
                  {game.icon}
                </span>
                <div className="mt-auto pt-5">
                  <h3 className="font-display text-[15px] font-semibold leading-tight text-white">
                    {game.title}
                  </h3>
                  <p className="mt-0.5 text-[10px] font-medium text-white/65">{game.subtitle}</p>
                  <div className="mt-2 flex items-center gap-2 text-[9px] font-semibold text-white/75">
                    <span className="flex items-center gap-1">
                      <span className="h-1 w-1 rounded-full bg-emerald-300" />
                      {game.activePlayers ?? 0} онлайн
                    </span>
                    {game.playedByMe ? <span className="text-white/45">· {game.playedByMe} игр</span> : null}
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {data.events.length > 0 && <EventsCarousel events={data.events} />}

      <section>
        <SectionHeader
          title="Ежедневные задания"
          subtitle={`${data.dailyQuests.filter((quest) => quest.completedAt).length} из ${data.dailyQuests.length} выполнено`}
          action={
            <Link to="/quests" className="flex items-center gap-1 text-[11px] font-semibold text-violet-300">
              Все <ChevronRight size={13} />
            </Link>
          }
        />
        <DayQuestCard
          quest={dailyQuest}
          onClaim={(id) => claimQuest.mutate(id)}
          claiming={claimQuest.isPending}
        />
      </section>

      <section>
        <SectionHeader
          title="Топ игроков"
          subtitle="Рейтинг по XP за всё время"
          action={
            <Link to="/leaderboard" className="flex items-center gap-1 text-[11px] font-semibold text-violet-300">
              Рейтинг <ChevronRight size={13} />
            </Link>
          }
        />
        <Card className="overflow-hidden">
          {data.topPlayers.map((player, index) => (
            <button
              key={player.id}
              type="button"
              onClick={() => navigate(`/profile/${player.id}`)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.045]',
                index !== data.topPlayers.length - 1 && 'border-b border-line/60',
              )}
            >
              <span
                className={cn(
                  'w-5 text-center font-display text-xs font-bold',
                  index === 0 ? 'text-amber-300' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-muted',
                )}
              >
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
              </span>
              <Avatar user={player} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-primary">{userName(player)}</p>
                <p className="text-[10px] text-muted">
                  Ур. {player.level} {player.username ? `· @${player.username}` : ''}
                </p>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-bold text-violet-300">
                <Zap size={12} /> {formatCompact(player.xp ?? 0)}
              </span>
              {player.id === user.id && <Badge tone="violet">вы</Badge>}
            </button>
          ))}
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Возможно, вы знакомы"
          subtitle="Активные игроки сообщества"
          action={
            <Link to="/friends" className="flex items-center gap-1 text-[11px] font-semibold text-violet-300">
              Найти <ChevronRight size={13} />
            </Link>
          }
        />
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {data.recommendations.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => navigate(`/profile/${player.id}`)}
              className="flex w-[128px] shrink-0 flex-col items-center rounded-3xl border border-line bg-surface/60 p-3 text-center transition hover:border-white/20"
            >
              <Avatar user={player} size={52} ring />
              <p className="mt-2 w-full truncate text-xs font-semibold text-primary">{userName(player)}</p>
              <p className="text-[10px] text-muted">Ур. {player.level}</p>
              <span className="mt-2 flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-1 text-[9px] font-semibold text-violet-300">
                <UserPlus size={10} /> Профиль
              </span>
            </button>
          ))}
        </div>
      </section>

      {data.recentResults.length > 0 && (
        <section className="pb-2">
          <SectionHeader title="Последние игры" subtitle="Ваша история матчей" />
          <Card className="divide-y divide-line/60">
            {data.recentResults.slice(0, 3).map((result) => (
              <div key={result.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl text-base',
                    result.outcome === 'WIN' ? 'bg-emerald-500/15' : 'bg-white/[0.05]',
                  )}
                >
                  {result.room?.game?.icon ?? (result.outcome === 'WIN' ? '🏆' : '🎮')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-primary">
                    {result.room?.game?.title ?? 'Игра'}
                  </p>
                  <p className="text-[10px] text-muted">
                    {result.outcome === 'WIN' ? 'Победа' : 'Матч завершён'} · {timeAgo(result.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-primary">+{result.xpEarned} XP</p>
                  <p className="text-[10px] text-amber-300/80">+{result.coinsEarned} F</p>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <div className="pb-4 text-center">
        <p className="text-[10px] text-muted/50">
          FUNBOX · {data.onlineNow} онлайн · FUN Coins не имеют денежной стоимости
        </p>
      </div>
    </div>
  );
}

function HeroStat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-white/[0.07] bg-white/[0.045] py-2 backdrop-blur">
      <span className="flex items-center gap-1 font-display text-[14px] font-semibold text-white">
        <span className="text-violet-300">{icon}</span>
        {value}
      </span>
      <span className="mt-0.5 text-[9px] font-medium text-violet-100/50">{label}</span>
    </div>
  );
}

function DayQuestCard({
  quest,
  onClaim,
  claiming,
}: {
  quest?: Dashboard['dailyQuests'][number];
  onClaim: (id: string) => void;
  claiming: boolean;
}) {
  if (!quest) return null;
  const progress = Math.min(100, (quest.progress / quest.quest.target) * 100);
  const complete = Boolean(quest.completedAt);
  const claimed = Boolean(quest.claimedAt);

  return (
    <Card className="relative overflow-hidden p-4">
      <div className="pointer-events-none absolute -right-6 -top-6 text-7xl opacity-[0.06]">🎯</div>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-fuchsia-500/10 text-xl">
          {quest.quest.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-bold text-primary">{quest.quest.title}</p>
            {claimed && <Badge tone="emerald">получено</Badge>}
            {complete && !claimed && <Badge tone="amber">готово</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted">{quest.quest.description}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold text-violet-300">+{quest.quest.xpReward} XP</p>
          <p className="text-[10px] text-amber-300/80">+{quest.quest.coinReward} F</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={quest.progress} max={quest.quest.target} height={5} className="flex-1" />
        <span className="text-[10px] font-semibold text-muted">
          {Math.min(quest.progress, quest.quest.target)}/{quest.quest.target}
        </span>
      </div>
      {complete && !claimed && (
        <Button
          size="sm"
          className="mt-3 w-full"
          loading={claiming}
          onClick={() => onClaim(quest.id)}
          icon={<Check size={14} />}
        >
          Забрать награду
        </Button>
      )}
    </Card>
  );
}

function EventsCarousel({ events }: { events: Event[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section>
      <SectionHeader
        title="Активные события"
        subtitle="Ограниченные награды и двойные очки"
        action={<Badge tone="rose">LIVE</Badge>}
      />
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {events.map((event) => (
          <div
            key={event.id}
            className="relative w-[285px] shrink-0 overflow-hidden rounded-3xl border border-white/10 p-4 shadow-card"
            style={{ background: event.gradient }}
          >
            <div className="absolute -right-4 -top-6 text-[84px] opacity-[0.18]">{event.icon}</div>
            <div className="relative">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white backdrop-blur">
                  <Flame size={10} /> live
                </span>
                <span className="text-[10px] font-medium text-white/65">
                  до {new Date(event.endsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <h3 className="mt-3 font-display text-[15px] font-semibold leading-snug text-white">
                {event.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-white/65">{event.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/80">
                  <span>+{event.rewardXp} XP</span>
                  <span className="text-white/35">·</span>
                  <span>+{event.rewardCoins} F</span>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-black/25 px-2 py-1 font-mono text-[10px] text-white/80 backdrop-blur">
                  <CalendarDays size={10} />
                  {formatTimeLeft(new Date(event.endsAt).getTime() - now)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
