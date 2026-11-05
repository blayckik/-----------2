import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Gift,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import { cn, formatNumber } from '../lib/utils';
import type { UserQuest } from '../types';
import { Badge, Button, Card, EmptyState, PageSkeleton, Progress, Tabs } from '../components/ui';

type QuestsData = {
  daily: UserQuest[];
  weekly: UserQuest[];
  onboarding: UserQuest[];
  special: UserQuest[];
  completed: number;
  claimable: number;
  total: number;
};

type Tab = 'daily' | 'weekly' | 'onboarding';

export function QuestsPage() {
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('daily');

  const { data, isLoading } = useQuery({
    queryKey: ['quests'],
    queryFn: async () => (await api.get('/quests')).data.data as QuestsData,
    refetchInterval: 30_000,
  });

  const claim = useMutation({
    mutationFn: async (id: string) => (await api.post(`/quests/${id}/claim`)).data.data,
    onSuccess: (result) => {
      haptic('success');
      toast.success(`Награда: +${result.xp} XP и +${result.coins} FUN Coins`);
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void refreshMe();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (isLoading || !data) {
    return (
      <div className="px-4 pt-3">
        <PageSkeleton />
      </div>
    );
  }

  const lists: Record<Tab, UserQuest[]> = {
    daily: data.daily,
    weekly: data.weekly,
    onboarding: [...data.onboarding, ...data.special],
  };
  const current = lists[tab];
  const completed = current.filter((quest) => quest.completedAt).length;
  const progressPercent = current.length ? Math.round((completed / current.length) * 100) : 0;

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
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/70">Quests</p>
          <h1 className="font-display text-xl font-semibold">Задания</h1>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-gradient-to-br from-[#2c1d07] via-[#24160f] to-[#0c0912] p-5">
        <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-amber-500/20 blur-[60px]" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/70">Сегодняшний прогресс</p>
            <p className="mt-1 font-display text-3xl font-semibold text-white">
              {completed}
              <span className="text-lg text-white/35"> / {current.length}</span>
            </p>
            <p className="mt-1 text-[11px] text-white/50">выполнено заданий</p>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-3xl backdrop-blur">
            🎯
          </div>
        </div>
        <div className="relative mt-4">
          <Progress value={progressPercent} max={100} height={7} />
          <div className="mt-2 flex items-center justify-between text-[9px] text-white/45">
            <span>{progressPercent}% пути</span>
            {data.claimable > 0 && (
              <span className="flex items-center gap-1 font-bold text-amber-300">
                <Gift size={10} /> {data.claimable} наград ждёт
              </span>
            )}
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(value) => {
          setTab(value);
          haptic('selection');
        }}
        options={[
          { value: 'daily', label: `Ежедневные · ${data.daily.length}` },
          { value: 'weekly', label: `Недельные · ${data.weekly.length}` },
          { value: 'onboarding', label: 'Особые' },
        ]}
        size="sm"
      />

      <div className="flex items-center gap-2 text-[10px] text-muted">
        {tab === 'daily' ? (
          <>
            <Timer size={12} className="text-amber-300" />
            Обновляются каждый день в 00:00 МСК
          </>
        ) : tab === 'weekly' ? (
          <>
            <CalendarClock size={12} className="text-violet-300" />
            Обновляются каждый понедельник
          </>
        ) : (
          <>
            <Sparkles size={12} className="text-fuchsia-300" />
            Особые задания за важные шаги
          </>
        )}
      </div>

      <div className="space-y-2.5">
        {current.length === 0 ? (
          <Card className="p-2">
            <EmptyState
              icon="✅"
              title="Все задания выполнены"
              text="Отличная работа! Новые задания появятся после обновления периода."
            />
          </Card>
        ) : (
          current.map((quest, index) => {
            const complete = Boolean(quest.completedAt);
            const claimed = Boolean(quest.claimedAt);
            const percent = Math.min(100, Math.round((quest.progress / quest.quest.target) * 100));
            return (
              <motion.div
                key={quest.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <Card className={cn('relative overflow-hidden p-4', claimed && 'opacity-70')}>
                  {complete && !claimed && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-300 to-orange-500" />
                  )}
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-white/[0.04] text-xl">
                      {quest.quest.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-bold text-primary">{quest.quest.title}</p>
                        {claimed ? (
                          <Badge tone="emerald"><Check size={9} /> получено</Badge>
                        ) : complete ? (
                          <Badge tone="amber">готово</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{quest.quest.description}</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <Progress value={quest.progress} max={quest.quest.target} height={5} className="flex-1" />
                        <span className="text-[10px] font-bold text-muted">
                          {Math.min(quest.progress, quest.quest.target)}/{quest.quest.target}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-3">
                    <div className="flex items-center gap-3 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-violet-300"><Zap size={11} /> +{quest.quest.xpReward} XP</span>
                      <span className="flex items-center gap-1 text-amber-300"><Trophy size={11} /> +{quest.quest.coinReward}</span>
                    </div>
                    {complete && !claimed ? (
                      <Button
                        size="sm"
                        loading={claim.isPending && claim.variables === quest.id}
                        onClick={() => claim.mutate(quest.id)}
                        icon={<Gift size={13} />}
                      >
                        Забрать
                      </Button>
                    ) : (
                      <span className="text-[10px] font-semibold text-muted">{percent}%</span>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold text-primary">
          <Target size={14} className="text-violet-300" /> Как зарабатывать быстрее
        </div>
        <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-muted">
          <li>• Выполняйте ежедневные задания каждый день — серия повышает награды.</li>
          <li>• Победа в Quiz Battle приносит XP и FUN Coins, а также прогресс к достижениям.</li>
          <li>• Приглашайте друзей: за каждого — бонус и особое задание.</li>
          <li>• Не забывайте про ежедневный бонус в кошельке.</li>
        </ul>
      </Card>
    </div>
  );
}
