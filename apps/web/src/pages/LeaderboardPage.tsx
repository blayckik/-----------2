import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Activity, Crown, Flame, Heart, Medal, Trophy, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { haptic } from '../lib/telegram';
import { cn, formatCompact, formatNumber, userName } from '../lib/utils';
import type { LeaderboardEntry } from '../types';
import { Avatar, Badge, Card, EmptyState, PageSkeleton, Tabs } from '../components/ui';

type LeaderboardType = 'players' | 'wins' | 'xp' | 'active' | 'popular';
type Period = 'today' | 'week' | 'month' | 'all';

const types: Array<{ value: LeaderboardType; label: string; icon: typeof Trophy }> = [
  { value: 'players', label: 'Игроки', icon: Trophy },
  { value: 'wins', label: 'Победы', icon: Medal },
  { value: 'xp', label: 'XP', icon: Zap },
  { value: 'active', label: 'Активность', icon: Activity },
  { value: 'popular', label: 'Популярность', icon: Heart },
];

const periods: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'all', label: 'Всё время' },
];

const metricLabels: Record<LeaderboardType, string> = {
  players: 'очков в играх',
  wins: 'побед',
  xp: 'XP за игры',
  active: 'действий',
  popular: 'лайков на постах',
};

export function LeaderboardPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [type, setType] = useState<LeaderboardType>('players');
  const [period, setPeriod] = useState<Period>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', type, period],
    queryFn: async () =>
      (await api.get('/leaderboard', { params: { type, period, limit: 50 } })).data.data as {
        leaderboard: LeaderboardEntry[];
        me: LeaderboardEntry | null;
      },
  });

  const entries = data?.leaderboard ?? [];
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-5 px-4 pt-4">
      <div className="relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-gradient-to-br from-[#34210a] via-[#241426] to-[#0b0914] p-5">
        <div className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-amber-500/20 blur-[60px]" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/70">
            <Crown size={13} /> Hall of fame
          </div>
          <h1 className="mt-2 font-display text-[26px] font-semibold text-white">Рейтинг FUNBOX</h1>
          <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-white/55">
            Лучшие игроки, самые активные и любимые авторы сообщества. Играйте, чтобы подняться выше.
          </p>
        </div>
      </div>

      <Tabs
        value={type}
        onChange={(value) => {
          setType(value);
          haptic('selection');
        }}
        size="sm"
        options={types.map((item) => ({ value: item.value, label: item.label, icon: <item.icon size={12} /> }))}
        className="mask-fade-x"
      />

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {periods.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setPeriod(item.value);
              haptic('selection');
            }}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition',
              period === item.value
                ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                : 'border-line bg-surface/60 text-muted',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : entries.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon="🏆"
            title="Рейтинг пока пуст"
            text="Сыграйте несколько игр — и вы попадёте в таблицу лидеров."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 items-end gap-2">
            {[top3[1], top3[0], top3[2]].map((entry, position) => {
              if (!entry) return <div key={position} />;
              const actualPlace = entry.rank;
              const isCenter = actualPlace === 1;
              return (
                <motion.button
                  key={entry.user.id}
                  type="button"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: position * 0.08 }}
                  onClick={() => navigate(`/profile/${entry.user.id}`)}
                  className={cn('flex flex-col items-center', isCenter && '-mt-4')}
                >
                  <div className="relative">
                    {isCenter && (
                      <motion.span
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 2.6, repeat: Infinity }}
                        className="absolute -top-6 left-1/2 -translate-x-1/2 text-amber-300"
                      >
                        <Crown size={22} fill="currentColor" />
                      </motion.span>
                    )}
                    <div
                      className={cn(
                        'rounded-full p-1',
                        actualPlace === 1
                          ? 'bg-gradient-to-b from-amber-300 to-orange-500'
                          : actualPlace === 2
                            ? 'bg-gradient-to-b from-slate-300 to-slate-500'
                            : 'bg-gradient-to-b from-orange-300 to-orange-700',
                      )}
                    >
                      <Avatar user={entry.user} size={isCenter ? 64 : 52} />
                    </div>
                    <span className="absolute -bottom-1 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-white/20 bg-app text-[9px] font-black text-white">
                      {actualPlace}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[90px] truncate text-center text-[11px] font-bold text-primary">
                    {userName(entry.user)}
                  </p>
                  <p className="text-[9px] text-muted">Ур. {entry.user.level}</p>
                  <div
                    className={cn(
                      'mt-2 flex w-full flex-col items-center rounded-t-2xl border border-b-0 px-1 pt-2',
                      actualPlace === 1
                        ? 'h-20 border-amber-400/20 bg-gradient-to-b from-amber-500/20 to-transparent'
                        : actualPlace === 2
                          ? 'h-14 border-slate-400/15 bg-gradient-to-b from-slate-500/15 to-transparent'
                          : 'h-11 border-orange-400/15 bg-gradient-to-b from-orange-500/15 to-transparent',
                    )}
                  >
                    <span className="font-display text-sm font-bold text-primary">{formatCompact(entry.value)}</span>
                    <span className="text-center text-[7px] uppercase leading-tight tracking-wide text-muted">
                      {metricLabels[type]}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <Card className="overflow-hidden">
            {rest.map((entry) => (
              <button
                key={entry.user.id}
                type="button"
                onClick={() => navigate(`/profile/${entry.user.id}`)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]',
                  entry.user.id === me?.id && 'bg-violet-500/10',
                )}
              >
                <span className="w-6 text-center font-display text-xs font-bold text-muted">{entry.rank}</span>
                <Avatar user={entry.user} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-primary">
                    {userName(entry.user)}
                    {entry.user.id === me?.id && <span className="ml-1.5 text-[9px] text-violet-300">вы</span>}
                  </p>
                  <p className="text-[10px] text-muted">
                    Ур. {entry.user.level}
                    {entry.user.username ? ` · @${entry.user.username}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-sm font-bold text-primary">{formatNumber(entry.value)}</p>
                  <p className="text-[8px] uppercase tracking-wide text-muted">{metricLabels[type]}</p>
                </div>
              </button>
            ))}
          </Card>

          {data?.me && data.me.rank > 3 && (
            <Card className="flex items-center gap-3 border-violet-400/25 bg-violet-500/10 p-4">
              <span className="w-6 text-center font-display text-sm font-bold text-violet-300">#{data.me.rank}</span>
              <Avatar user={data.me.user} size={42} ring />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-primary">Ваше место в рейтинге</p>
                <p className="text-[10px] text-muted">{metricLabels[type]}</p>
              </div>
              <span className="font-display text-sm font-bold text-violet-300">{formatNumber(data.me.value)}</span>
            </Card>
          )}

          <div className="flex items-center justify-center gap-2 pb-2 text-[9px] text-muted/60">
            <Flame size={11} /> Рейтинг обновляется в реальном времени
          </div>
        </>
      )}
    </div>
  );
}
