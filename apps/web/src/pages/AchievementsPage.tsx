import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Lock, Sparkles, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { cn, formatNumber, rarityColor, rarityLabel } from '../lib/utils';
import type { Achievement } from '../types';
import { Badge, Card, EmptyState, PageSkeleton, Progress, Tabs } from '../components/ui';

const metricLabels: Record<string, string> = {
  GAMES_PLAYED: 'игр',
  GAMES_WON: 'побед',
  QUIZ_WINS: 'побед в квизах',
  FRIENDS_ADDED: 'друзей',
  POSTS_CREATED: 'постов',
  COMMENTS_CREATED: 'комментариев',
  LIKES_GIVEN: 'лайков',
  LIKES_RECEIVED: 'лайков получено',
  MESSAGES_SENT: 'сообщений',
  LOGIN_STREAK: 'дней подряд',
  REFERRALS: 'приглашений',
  XP_EARNED: 'XP',
  COINS_EARNED: 'монет',
  IMAGES_GUESSED: 'изображений',
  WORDS_SUBMITTED: 'слов',
  WYR_VOTES: 'голосов',
  PROFILE_COMPLETED: 'заполненный профиль',
};

type Filter = 'all' | 'unlocked' | 'locked';

export function AchievementsPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['achievements'],
    queryFn: async () => (await api.get('/achievements')).data.data as Achievement[],
  });

  const achievements = data ?? [];
  const unlocked = achievements.filter((achievement) => achievement.unlocked);
  const filtered = useMemo(
    () =>
      achievements.filter((achievement) =>
        filter === 'all' ? true : filter === 'unlocked' ? achievement.unlocked : !achievement.unlocked,
      ),
    [achievements, filter],
  );
  const percent = achievements.length ? Math.round((unlocked.length / achievements.length) * 100) : 0;

  if (isLoading) {
    return (
      <div className="px-4 pt-3">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 pt-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/70">Trophy room</p>
          <h1 className="font-display text-xl font-semibold">Достижения</h1>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-gradient-to-br from-[#2e123f] via-[#1d112c] to-[#0b0913] p-5">
        <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-[60px]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-200/60">Коллекция</p>
            <p className="mt-1 font-display text-3xl font-semibold text-white">
              {unlocked.length}
              <span className="text-lg text-white/35"> / {achievements.length}</span>
            </p>
            <p className="mt-1 text-[11px] text-white/50">достижений разблокировано</p>
            <div className="mt-3 w-44">
              <Progress value={percent} max={100} height={5} />
              <p className="mt-1.5 text-[9px] text-white/40">{percent}% коллекции</p>
            </div>
          </div>
          <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/10 bg-white/10 text-4xl backdrop-blur">
            🏆
          </div>
        </div>
      </div>

      <Tabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `Все · ${achievements.length}` },
          { value: 'unlocked', label: `Открыто · ${unlocked.length}` },
          { value: 'locked', label: `Закрыто · ${achievements.length - unlocked.length}` },
        ]}
        size="sm"
      />

      <div className="grid grid-cols-2 gap-2.5">
        {filtered.map((achievement, index) => {
          const color = rarityColor[achievement.rarity] ?? '#94a3b8';
          return (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.025 }}
              className={cn(
                'relative overflow-hidden rounded-3xl border p-4',
                achievement.unlocked ? 'border-line bg-surface/70' : 'border-line/60 bg-surface/30',
              )}
            >
              <div
                className="absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl"
                style={{ background: `${color}${achievement.unlocked ? '28' : '12'}` }}
              />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-2xl border text-2xl',
                      !achievement.unlocked && 'grayscale',
                    )}
                    style={{ background: `${color}18`, borderColor: `${color}35` }}
                  >
                    {achievement.unlocked ? achievement.icon : <Lock size={18} className="text-muted" />}
                  </span>
                  {achievement.unlocked ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                      <Check size={12} />
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ color }}>
                      {rarityLabel[achievement.rarity]}
                    </span>
                  )}
                </div>
                <h3 className={cn('mt-2.5 text-[12px] font-bold leading-tight', achievement.unlocked ? 'text-primary' : 'text-muted')}>
                  {achievement.name}
                </h3>
                <p className="mt-1 line-clamp-2 min-h-[26px] text-[9px] leading-relaxed text-muted">
                  {achievement.description}
                </p>
                <div className="mt-2 flex items-center gap-2 border-t border-line/50 pt-2 text-[9px]">
                  <span className="font-bold text-violet-300">+{achievement.xpReward} XP</span>
                  <span className="text-amber-300/80">+{achievement.coinReward} F</span>
                </div>
                {!achievement.unlocked && achievement.metric && (
                  <p className="mt-1.5 text-[8px] text-muted/60">
                    Нужно: {formatNumber(achievement.threshold)} {metricLabels[achievement.metric] ?? achievement.metric}
                  </p>
                )}
                {achievement.unlocked && (
                  <span className="mt-1.5 inline-flex items-center gap-0.5 text-[8px] font-semibold text-emerald-300/80">
                    <Sparkles size={8} /> получено
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card className="p-2">
          <EmptyState
            icon="🏅"
            title={filter === 'unlocked' ? 'Пока нет достижений' : 'Всё открыто!'}
            text={filter === 'unlocked' ? 'Сыграйте первую игру и начните собирать коллекцию.' : 'Вы собрали все доступные достижения. Невероятно!'}
          />
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold text-primary">
          <Trophy size={14} className="text-fuchsia-300" /> Зачем достижения?
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
          Каждое достижение даёт XP и FUN Coins, а редкие значки отображаются в профиле.
          Всего доступно {achievements.length} наград — соберите коллекцию и станьте легендой FUNBOX.
        </p>
        {me && (
          <div className="mt-3 flex items-center gap-2">
            <Badge tone="violet">{me.level} уровень</Badge>
            <Badge tone="amber">{formatNumber(me.xp)} XP</Badge>
          </div>
        )}
      </Card>
    </div>
  );
}
