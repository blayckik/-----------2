import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCheck, ChevronRight } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { cn, timeAgo } from '../lib/utils';
import { Badge, Button, Card, EmptyState, PageSkeleton } from '../components/ui';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: { conversationId?: string; postId?: string; roomCode?: string; friendId?: string } | null;
  readAt: string | null;
  createdAt: string;
}

const icons: Record<string, string> = {
  FRIEND_REQUEST: '👥',
  FRIEND_ACCEPTED: '✅',
  MESSAGE: '💬',
  ACHIEVEMENT: '🏆',
  DAILY: '🎁',
  GAME_INVITE: '🎮',
  SYSTEM: '📣',
  REPORT: '🛡️',
  REWARD: '✨',
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['notifications'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get(`/notifications?page=${pageParam}`)).data.data as {
        notifications: Notification[];
        unread: number;
        page: number;
      },
    getNextPageParam: (lastPage) =>
      lastPage.notifications.length === 20 ? lastPage.page + 1 : undefined,
  });

  const notifications = [
    ...new Map(
      (data?.pages ?? [])
        .flatMap((page) => page.notifications)
        .map((notification) => [notification.id, notification]),
    ).values(),
  ];
  const unread = data?.pages[0]?.unread ?? 0;

  const read = useMutation({
    mutationFn: async (notification: Notification) => {
      if (!notification.readAt) await api.post(`/notifications/${notification.id}/read`);
      return notification;
    },
    onSuccess: (notification) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      const target = notification.data;
      if (target?.conversationId) navigate(`/chat/${target.conversationId}`);
      else if (target?.roomCode) navigate(`/join/${target.roomCode}`);
      else if (notification.type === 'FRIEND_REQUEST') navigate('/friends');
      else if (notification.type === 'DAILY' || notification.type === 'REWARD') navigate('/wallet');
      else if (notification.type === 'ACHIEVEMENT') navigate('/achievements');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const readAll = useMutation({
    mutationFn: async () => api.post('/notifications/read-all'),
    onSuccess: () => {
      toast.success('Все уведомления прочитаны');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4 px-4 pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Inbox</p>
            <h1 className="font-display text-xl font-semibold">Уведомления</h1>
          </div>
        </div>
        {unread > 0 && (
          <Button size="sm" variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()} icon={<CheckCheck size={13} />}>
            Прочитать
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : notifications.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon="🔔"
            title="Уведомлений нет"
            text="Здесь появятся заявки в друзья, достижения, приглашения в игры и награды."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification, index) => (
            <motion.button
              key={notification.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => read.mutate(notification)}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition',
                notification.readAt
                  ? 'border-line bg-surface/40'
                  : 'border-violet-400/20 bg-violet-500/[0.07]',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-lg">
                {icons[notification.type] ?? '🔔'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[12px] font-bold text-primary">{notification.title}</p>
                  {!notification.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted">{notification.body}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[9px] text-muted/70">{timeAgo(notification.createdAt)}</span>
                  <Badge tone="neutral">{notification.type.toLowerCase().replace(/_/g, ' ')}</Badge>
                </div>
              </div>
              <ChevronRight size={15} className="mt-2 shrink-0 text-muted" />
            </motion.button>
          ))}
          {hasNextPage && (
            <Button
              variant="secondary"
              fullWidth
              loading={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              Показать ещё
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
