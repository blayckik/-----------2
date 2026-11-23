import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Coins,
  Gamepad2,
  Heart,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Star,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, assetUrl, getErrorMessage, uploadImage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import { cn, formatNumber, rarityColor, rarityLabel, timeAgo, userName } from '../lib/utils';
import type { Achievement, Post, UserCard, UserStats } from '../types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageSkeleton,
  Progress,
  SectionHeader,
  Textarea,
  Toggle,
} from '../components/ui';

interface ProfileData extends UserCard {
  xp: number;
  coins: number;
  isBanned?: boolean;
  banReason?: string | null;
  profile: {
    displayName: string | null;
    bio: string | null;
    accentColor: string;
    bannerUrl: string | null;
    country?: string | null;
    hideFriends: boolean;
    hideActivity: boolean;
    allowStrangersMessages: boolean;
    allowGameInvites: boolean;
    profileCompleted: boolean;
  };
  stats: UserStats;
  achievements: Array<{ id: string; unlockedAt: string; achievement: Achievement }>;
  purchases: Array<{
    id: string;
    createdAt: string;
    item: {
      id: string;
      code: string;
      name: string;
      description: string;
      icon: string;
      type: string;
      rarity: Achievement['rarity'];
    };
  }>;
  posts: Post[];
  relationship: {
    isSelf: boolean;
    isFriend: boolean;
    requestStatus: string | null;
    requestDirection: 'outgoing' | 'incoming' | null;
    isBlocked: boolean;
    isFollowing: boolean;
  };
  followersCount: number;
  followingCount: number;
  levelProgress: { current: number; needed: number; percent: number; level: number };
  friends: UserCard[];
  activity: Array<{ id: string; action: string; metadata: Record<string, unknown> | null; createdAt: string }>;
}

const activityLabels: Record<string, string> = {
  'auth.telegram': 'Вход через Telegram',
  'auth.dev': 'Вход в приложение',
  'game.quiz.finished': 'Завершена игра Quiz Battle',
  'game.word-duel.finished': 'Завершена дуэль слов',
  'social.post.created': 'Новая публикация',
  'friend.accepted': 'Новый друг',
  'achievement.unlocked': 'Открыто достижение',
  'admin.user.ban': 'Модерация пользователя',
  'admin.post.delete': 'Удалена публикация',
  'admin.report.resolve': 'Обработана жалоба',
  'metric.games_played': 'Сыграна игра',
  'metric.games_won': 'Одержана победа',
  'metric.quiz_wins': 'Победа в Quiz Battle',
  'metric.friends_added': 'Новый друг',
  'metric.posts_created': 'Создана публикация',
  'metric.comments_created': 'Оставлен комментарий',
  'metric.likes_given': 'Поставлен лайк',
  'metric.likes_received': 'Получен лайк',
  'metric.messages_sent': 'Отправлено сообщение',
  'metric.wyr_votes': 'Голос в Would You Rather',
  'metric.images_guessed': 'Угадано изображение',
  'metric.words_submitted': 'Составлено слово',
  'metric.login_streak': 'Ежедневный вход',
};

const accentPalette = ['#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1'];

export function ProfilePage() {
  const { id } = useParams();
  const { me, refreshMe } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('ABUSE');

  const profileId = id ?? me?.id;
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['profile', profileId],
    queryFn: async () => (await api.get(`/me/${profileId}`)).data.data as ProfileData,
    enabled: Boolean(profileId),
  });

  const isSelf = data?.relationship.isSelf ?? !id;
  const cosmetics = data?.purchases ?? [];
  const frameItem = cosmetics.find((entry) => entry.item.type === 'AVATAR');
  const badgeItem = cosmetics.find((entry) => entry.item.type === 'BADGE');
  const titleItem = cosmetics.find((entry) => entry.item.type === 'TITLE');
  const frameGradient =
    frameItem?.item.code === 'exclusive-inferno-frame'
      ? 'bg-gradient-to-br from-amber-300 via-orange-500 to-rose-700'
      : frameItem?.item.code === 'exclusive-aurora-frame'
        ? 'bg-gradient-to-br from-emerald-300 via-cyan-400 to-violet-500'
        : 'bg-gradient-to-br from-fuchsia-400 via-violet-500 to-cyan-400';

  const follow = useMutation({
    mutationFn: async () => {
      if (!data) return;
      if (data.relationship.isFollowing) await api.delete(`/social/users/${data.id}/follow`);
      else await api.post(`/social/users/${data.id}/follow`);
    },
    onSuccess: () => {
      haptic('success');
      void refetch();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const addFriend = useMutation({
    mutationFn: async () => {
      if (!data) return;
      await api.post('/friends/request', { userId: data.id });
    },
    onSuccess: () => {
      haptic('success');
      toast.success('Заявка в друзья отправлена');
      void refetch();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openChat = useMutation({
    mutationFn: async () => {
      const response = await api.post('/chat/conversations', { userId: data?.id });
      return response.data.data as { id: string };
    },
    onSuccess: (conversation) => navigate(`/chat/${conversation.id}`),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const block = useMutation({
    mutationFn: async () => {
      if (!data) return;
      await api.post(`/social/users/${data.id}/block`);
    },
    onSuccess: () => {
      toast.success('Пользователь заблокирован');
      setMenuOpen(false);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      navigate('/social');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const report = useMutation({
    mutationFn: async () => {
      if (!data) return;
      await api.post('/social/reports', { reportedUserId: data.id, reason: reportReason });
    },
    onSuccess: () => {
      toast.success('Жалоба отправлена');
      setReportOpen(false);
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

  const banner = assetUrl(data.profile?.bannerUrl);
  const accent = data.profile?.accentColor ?? '#8b5cf6';

  return (
    <div className="pb-4">
      <div className="relative h-[150px] overflow-hidden">
        {banner ? (
          <img src={banner} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{ background: `radial-gradient(circle at 35% 20%, ${accent}55, transparent 55%), linear-gradient(160deg, #17102e, #0b0a16)` }}
            />
            <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:22px_22px]" />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-app via-app/25 to-transparent" />
        <div className="absolute left-4 top-[calc(var(--safe-top,0px)+8px)] flex gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/30 text-white backdrop-blur"
            aria-label="Назад"
          >
            <ArrowLeft size={18} />
          </button>
        </div>
        <div className="absolute right-4 top-[calc(var(--safe-top,0px)+8px)] flex gap-2">
          {isSelf ? (
            <>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/30 text-white backdrop-blur"
                aria-label="Редактировать"
              >
                <Pencil size={15} />
              </button>
              <Link
                to="/settings"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/30 text-white backdrop-blur"
              >
                <Settings size={16} />
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/30 text-white backdrop-blur"
            >
              <MoreHorizontal size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 -mt-12 px-4">
        <div className="flex items-end justify-between">
          <div className="relative">
            <div
              className={cn(
                'rounded-full',
                frameItem
                  ? `${frameGradient} p-[3px] shadow-[0_0_28px_-6px_rgba(168,85,247,.8)]`
                  : '',
              )}
            >
              <Avatar user={data} size={frameItem ? 86 : 92} ring={!frameItem} />
            </div>
            {badgeItem && (
              <span
                className="absolute -bottom-1 -left-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-app bg-gradient-to-br from-amber-300 to-orange-500 text-base shadow-lg"
                title={badgeItem.item.name}
              >
                {badgeItem.item.icon}
              </span>
            )}
            {data.role !== 'USER' && (
              <span className="absolute -right-2 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-app bg-gradient-to-br from-amber-300 to-orange-500 text-amber-950 shadow-lg">
                {data.role === 'ADMIN' ? <Shield size={15} /> : <ShieldAlert size={15} />}
              </span>
            )}
          </div>
          <div className="mb-1 flex gap-2">
            {isSelf ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)} icon={<Pencil size={13} />}>
                  Изменить
                </Button>
                {me?.role === 'ADMIN' && (
                  <Button size="sm" variant="secondary" onClick={() => navigate('/admin')} icon={<Shield size={13} />}>
                    Админ
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant={data.relationship.isFollowing ? 'secondary' : 'primary'}
                  onClick={() => follow.mutate()}
                  icon={data.relationship.isFollowing ? <Check size={13} /> : <Star size={13} />}
                >
                  {data.relationship.isFollowing ? 'Вы подписаны' : 'Подписаться'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openChat.mutate()} icon={<MessageCircle size={13} />}>
                  Написать
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[22px] font-semibold leading-tight">{userName(data)}</h1>
            {data.relationship.isFriend && <Badge tone="emerald"><UserCheck size={10} /> друг</Badge>}
            {titleItem && <Badge tone="amber">{titleItem.item.icon} {titleItem.item.name}</Badge>}
            <Badge tone="violet">Ур. {data.level}</Badge>
          </div>
          {data.username && <p className="mt-0.5 text-xs text-muted">@{data.username}</p>}
          {data.profile?.bio && <p className="mt-2.5 max-w-lg text-[12px] leading-relaxed text-muted">{data.profile.bio}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <Users size={11} /> {data.followersCount} подписчиков
            </span>
            <span className="flex items-center gap-1">
              <UserPlus size={11} /> {data.followingCount} подписок
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays size={11} /> с {new Date(data.createdAt ?? Date.now()).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface/60 p-3">
            <div className="mb-1.5 flex items-center justify-between text-[10px]">
              <span className="font-semibold text-primary">Уровень {data.level}</span>
              <span className="text-muted">{formatNumber(data.xp)} XP</span>
            </div>
            <Progress value={data.levelProgress?.current ?? 0} max={data.levelProgress?.needed ?? 1} height={6} />
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <ProfileStat icon={<Gamepad2 size={13} />} value={data.stats?.gamesPlayed ?? 0} label="игр" />
            <ProfileStat icon={<Trophy size={13} />} value={data.stats?.gamesWon ?? 0} label="побед" />
            <ProfileStat icon={<Users size={13} />} value={data.stats?.friendsCount ?? 0} label="друзей" />
            <ProfileStat icon={<Coins size={13} />} value={data.coins} label="FUN" />
          </div>

          <div className="mt-4 flex gap-2">
            <div className="flex flex-1 items-center justify-between rounded-2xl border border-line bg-surface/60 px-3 py-2.5">
              <span className="text-[10px] text-muted">Побед</span>
              <span className="text-sm font-bold text-emerald-300">{data.stats?.gamesWon ?? 0}</span>
            </div>
            <div className="flex flex-1 items-center justify-between rounded-2xl border border-line bg-surface/60 px-3 py-2.5">
              <span className="text-[10px] text-muted">Квизов</span>
              <span className="text-sm font-bold text-violet-300">{data.stats?.quizWins ?? 0}</span>
            </div>
            <div className="flex flex-1 items-center justify-between rounded-2xl border border-line bg-surface/60 px-3 py-2.5">
              <span className="text-[10px] text-muted">Дней</span>
              <span className="text-sm font-bold text-amber-300">{data.stats?.loginStreak ?? 0}</span>
            </div>
          </div>
        </div>

        {data.achievements.length > 0 && (
          <section className="mt-6">
            <SectionHeader
              title="Достижения"
              subtitle={`${data.achievements.length} разблокировано`}
              action={
                isSelf ? (
                  <Link to="/achievements" className="text-[11px] font-semibold text-violet-300">
                    Все
                  </Link>
                ) : undefined
              }
            />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {data.achievements.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="flex w-[104px] shrink-0 flex-col items-center rounded-2xl border border-line bg-surface/60 p-3 text-center"
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
                    style={{ background: `${rarityColor[entry.achievement.rarity]}22`, border: `1px solid ${rarityColor[entry.achievement.rarity]}44` }}
                  >
                    {entry.achievement.icon}
                  </span>
                  <p className="mt-2 line-clamp-2 text-[10px] font-bold leading-tight text-primary">
                    {entry.achievement.name}
                  </p>
                  <span className="mt-1 text-[8px]" style={{ color: rarityColor[entry.achievement.rarity] }}>
                    {rarityLabel[entry.achievement.rarity]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {cosmetics.length > 0 && (
          <section className="mt-6">
            <SectionHeader
              title="Косметика"
              subtitle={`${cosmetics.length} предметов коллекции`}
              action={
                isSelf ? (
                  <Link to="/wallet" className="text-[11px] font-semibold text-violet-300">
                    Магазин
                  </Link>
                ) : undefined
              }
            />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {cosmetics.map((entry) => {
                const active =
                  (entry.item.type === 'AVATAR' && frameItem?.id === entry.id) ||
                  (entry.item.type === 'BADGE' && badgeItem?.id === entry.id) ||
                  (entry.item.type === 'TITLE' && titleItem?.id === entry.id);
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'relative flex w-[116px] shrink-0 flex-col items-center rounded-2xl border p-3 text-center',
                      active ? 'border-violet-400/50 bg-violet-500/10' : 'border-line bg-surface/60',
                    )}
                  >
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
                      style={{
                        background: `${rarityColor[entry.item.rarity]}22`,
                        border: `1px solid ${rarityColor[entry.item.rarity]}44`,
                      }}
                    >
                      {entry.item.icon}
                    </span>
                    <p className="mt-2 line-clamp-2 text-[10px] font-bold leading-tight text-primary">{entry.item.name}</p>
                    <span className="mt-1 text-[8px]" style={{ color: rarityColor[entry.item.rarity] }}>
                      {active ? 'Надето' : rarityLabel[entry.item.rarity]}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}


        {!data.profile?.hideFriends && data.friends.length > 0 && (
          <section className="mt-6">
            <SectionHeader title="Друзья" subtitle={`${data.stats?.friendsCount ?? data.friends.length} человек`} />
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
              {data.friends.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() => navigate(`/profile/${friend.id}`)}
                  className="flex w-[80px] shrink-0 flex-col items-center"
                >
                  <Avatar user={friend} size={50} />
                  <span className="mt-1.5 w-full truncate text-center text-[10px] font-semibold text-muted">
                    {userName(friend)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6">
          <SectionHeader
            title="Публикации"
            subtitle={`${data.posts.length} ${data.posts.length === 1 ? 'пост' : 'публикаций'}`}
          />
          {data.posts.length === 0 ? (
            <Card className="p-2">
              <EmptyState icon="📝" title="Публикаций пока нет" text={isSelf ? 'Поделитесь первой мыслью в ленте.' : 'Пользователь ещё ничего не публиковал.'} className="py-8" />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {data.posts.map((post) => (
                <Card key={post.id} className="p-4">
                  <p className="line-clamp-3 text-[12px] leading-relaxed text-primary/85">{post.content}</p>
                  {post.imageUrl && (
                    <img src={assetUrl(post.imageUrl) ?? ''} alt="" className="mt-2 h-32 w-full rounded-xl object-cover" loading="lazy" />
                  )}
                  <div className="mt-2.5 flex items-center gap-4 text-[10px] text-muted">
                    <span className="flex items-center gap-1"><Heart size={11} /> {post.likeCount}</span>
                    <span className="flex items-center gap-1"><MessageCircle size={11} /> {post.commentCount}</span>
                    <span className="ml-auto">{timeAgo(post.createdAt)}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {data.activity.length > 0 && (
          <section className="mt-6">
            <SectionHeader title="История активности" subtitle="Последние события профиля" />
            <Card className="divide-y divide-line/60 overflow-hidden">
              {data.activity.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[11px]">
                    {entry.action.startsWith('game')
                      ? '🎮'
                      : entry.action.startsWith('social')
                        ? '✍️'
                        : entry.action.startsWith('achievement')
                          ? '🏆'
                          : entry.action.startsWith('friend')
                            ? '🤝'
                            : '⚡'}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-primary">
                    {activityLabels[entry.action] ?? entry.action}
                  </p>
                  <span className="text-[9px] text-muted">{timeAgo(entry.createdAt)}</span>
                </div>
              ))}
            </Card>
          </section>
        )}

        {!isSelf && (
          <div className="mt-5 grid grid-cols-2 gap-2 pb-4">
            {!data.relationship.isFriend ? (
              data.relationship.requestStatus === 'outgoing' ? (
                <Button variant="secondary" disabled icon={<Check size={15} />}>Заявка отправлена</Button>
              ) : data.relationship.requestStatus === 'incoming' ? (
                <Button onClick={() => navigate('/friends')} icon={<UserCheck size={15} />}>Ответить на заявку</Button>
              ) : (
                <Button variant="secondary" onClick={() => addFriend.mutate()} icon={<UserPlus size={15} />}>В друзья</Button>
              )
            ) : (
              <Button variant="secondary" onClick={() => openChat.mutate()} icon={<MessageCircle size={15} />}>Написать</Button>
            )}
            <Button variant="secondary" onClick={() => follow.mutate()} icon={<Star size={15} />}>
              {data.relationship.isFollowing ? 'Отписаться' : 'Подписаться'}
            </Button>
          </div>
        )}
      </div>

      <EditProfileModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        profile={data}
        onSaved={async () => {
          setEditOpen(false);
          await refreshMe();
          await refetch();
        }}
      />

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Действия">
        <div className="space-y-1.5 pb-2">
          <button
            type="button"
            onClick={() => {
              setReportOpen(true);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-left text-rose-300"
          >
            <ShieldAlert size={16} /> <span className="text-xs font-semibold">Пожаловаться</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Заблокировать пользователя? Он больше не сможет писать вам и видеть вашу ленту.')) block.mutate();
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-left text-rose-300"
          >
            <X size={16} /> <span className="text-xs font-semibold">Заблокировать</span>
          </button>
        </div>
      </Modal>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Жалоба на пользователя">
        <div className="space-y-2 pb-2">
          {[
            ['ABUSE', 'Оскорбления'],
            ['SPAM', 'Спам'],
            ['SCAM', 'Мошенничество'],
            ['OTHER', 'Другое'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setReportReason(value)}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border p-3 text-left',
                reportReason === value ? 'border-rose-400/40 bg-rose-500/10' : 'border-line bg-white/[0.03]',
              )}
            >
              <span className={cn('h-4 w-4 rounded-full border', reportReason === value ? 'border-rose-400 bg-rose-500' : 'border-line')} />
              <span className="text-xs font-semibold">{label}</span>
            </button>
          ))}
          <Button fullWidth variant="danger" loading={report.isPending} onClick={() => report.mutate()}>
            Отправить жалобу
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function ProfileStat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-line bg-surface/60 py-2.5">
      <span className="text-violet-300">{icon}</span>
      <span className="mt-1 text-sm font-bold text-primary">{formatNumber(value)}</span>
      <span className="text-[9px] text-muted">{label}</span>
    </div>
  );
}

function EditProfileModal({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileData;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(profile.profile?.displayName ?? '');
  const [firstName, setFirstName] = useState(profile.firstName ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.profile?.bio ?? '');
  const [accent, setAccent] = useState(profile.profile?.accentColor ?? '#8b5cf6');
  const [hideFriends, setHideFriends] = useState(profile.profile?.hideFriends ?? false);
  const [hideActivity, setHideActivity] = useState(profile.profile?.hideActivity ?? false);
  const [allowStrangersMessages, setAllowStrangersMessages] = useState(profile.profile?.allowStrangersMessages ?? true);
  const [allowGameInvites, setAllowGameInvites] = useState(profile.profile?.allowGameInvites ?? true);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(profile.profile?.displayName ?? '');
    setFirstName(profile.firstName ?? '');
    setUsername(profile.username ?? '');
    setBio(profile.profile?.bio ?? '');
    setAccent(profile.profile?.accentColor ?? '#8b5cf6');
    setHideFriends(profile.profile?.hideFriends ?? false);
    setHideActivity(profile.profile?.hideActivity ?? false);
    setAllowStrangersMessages(profile.profile?.allowStrangersMessages ?? true);
    setAllowGameInvites(profile.profile?.allowGameInvites ?? true);
    setAvatarUrl(profile.avatarUrl ?? '');
  }, [open, profile]);

  async function uploadAvatar(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setAvatarUrl(url);
      toast.success('Аватар загружен');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch('/me', {
        firstName,
        displayName: displayName || null,
        username: username || null,
        bio: bio || null,
        accentColor: accent,
        avatarUrl: avatarUrl || null,
        hideFriends,
        hideActivity,
        allowStrangersMessages,
        allowGameInvites,
      });
      haptic('success');
      toast.success('Профиль обновлён');
      await onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Редактировать профиль"
      footer={<Button fullWidth loading={saving} onClick={save}>Сохранить</Button>}
    >
      <div className="space-y-4 pb-2">
        <div className="flex items-center gap-4">
          <Avatar user={{ ...profile, avatarUrl }} size={64} />
          <div>
            <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
              Сменить аватар
            </Button>
            <p className="mt-1 text-[9px] text-muted">JPEG, PNG, WebP до 8 МБ</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => void uploadAvatar(event.target.files?.[0])}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Имя" value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={64} />
          <Input label="Username" value={username} onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} maxLength={32} />
        </div>
        <Input label="Отображаемое имя" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={48} placeholder="Как вас показывать" />
        <Textarea label="О себе" value={bio} onChange={(event) => setBio(event.target.value)} rows={3} maxLength={280} placeholder="Расскажите о своих игровых предпочтениях" />
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Акцент профиля</p>
          <div className="flex flex-wrap gap-2">
            {accentPalette.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setAccent(color)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 transition',
                  accent === color ? 'border-white scale-110' : 'border-transparent',
                )}
                style={{ background: color }}
                aria-label={color}
              >
                {accent === color && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white/[0.02] px-3">
          <p className="pt-3 text-[10px] font-bold uppercase tracking-wider text-muted">Приватность</p>
          <Toggle checked={hideFriends} onChange={setHideFriends} label="Скрыть друзей" description="Список друзей будет виден только вам" />
          <Toggle checked={hideActivity} onChange={setHideActivity} label="Скрыть активность" description="Не показывать историю действий" />
          <Toggle checked={allowStrangersMessages} onChange={setAllowStrangersMessages} label="Сообщения от всех" description="Разрешить писать незнакомым игрокам" />
          <Toggle checked={allowGameInvites} onChange={setAllowGameInvites} label="Приглашения в игры" description="Разрешить приглашать вас в комнаты" />
        </div>
      </div>
    </Modal>
  );
}
