import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  Ban,
  BarChart3,
  BellRing,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Edit3,
  Flag,
  Gamepad2,
  LayoutDashboard,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  Trophy,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { api, assetUrl, getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { cn, formatDate, formatNumber, rarityColor, timeAgo, userName } from '../lib/utils';
import type { Achievement, Profile } from '../types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Textarea,
} from '../components/ui';

type AdminTab =
  | 'overview'
  | 'users'
  | 'posts'
  | 'questions'
  | 'categories'
  | 'quests'
  | 'achievements'
  | 'events'
  | 'reports'
  | 'transactions'
  | 'activity';

interface AdminUser {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  isBanned: boolean;
  banReason: string | null;
  level: number;
  xp: number;
  coins: number;
  createdAt: string;
  lastActiveAt: string;
  stats?: { gamesPlayed: number; gamesWon: number } | null;
  profile?: Profile | null;
}

interface AdminStats {
  users: number;
  newUsers: number;
  activeToday: number;
  posts: number;
  messages: number;
  gamesPlayed: number;
  activeRooms: number;
  pendingReports: number;
  coinsSupply: number;
  achievementsUnlocked: number;
  transactions: number;
  chart: Array<{ label: string; users: number; games: number; posts: number }>;
  recentUsers: AdminUser[];
}

interface AdminQuestion {
  id: string;
  prompt: string;
  options: string[] | Record<string, unknown>;
  correctOption: number | null;
  answerText: string | null;
  hint: string | null;
  mediaUrl: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  isActive: boolean;
  isApproved: boolean;
  createdAt: string;
  game?: { id: string; title: string; slug: string } | null;
  category?: { id: string; name: string; icon?: string | null } | null;
  author?: { firstName: string; username: string | null; avatarUrl: string | null; level: number } | null;
}

const tabs: Array<{ value: AdminTab; label: string; icon: typeof Users; adminOnly?: boolean }> = [
  { value: 'overview', label: 'Обзор', icon: LayoutDashboard },
  { value: 'users', label: 'Пользователи', icon: Users },
  { value: 'posts', label: 'Публикации', icon: Flag },
  { value: 'questions', label: 'Вопросы', icon: Gamepad2, adminOnly: true },
  { value: 'categories', label: 'Категории', icon: ListChecks, adminOnly: true },
  { value: 'quests', label: 'Задания', icon: ListChecks, adminOnly: true },
  { value: 'achievements', label: 'Достижения', icon: Trophy, adminOnly: true },
  { value: 'events', label: 'События', icon: Calendar, adminOnly: true },
  { value: 'reports', label: 'Жалобы', icon: ShieldAlert },
  { value: 'transactions', label: 'Экономика', icon: Coins, adminOnly: true },
  { value: 'activity', label: 'Активность', icon: Activity },
];

export function AdminPage() {
  const { me, loading } = useAuth();
  const [tab, setTab] = useState<AdminTab>('overview');

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center bg-app text-sm text-muted">Загрузка панели…</div>;
  }

  if (!me || me.role === 'USER') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-app px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[26px] border border-rose-500/20 bg-rose-500/10 text-rose-300">
          <ShieldAlert size={34} />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold">Доступ ограничен</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Раздел доступен модераторам и администраторам. Права проверяются на backend.
        </p>
        <Link to="/" className="mt-5">
          <Button>Вернуться в FUNBOX</Button>
        </Link>
      </div>
    );
  }

  const visibleTabs = tabs.filter((item) => !item.adminOnly || me.role === 'ADMIN');

  return (
    <div className="min-h-dvh bg-[#07070d] text-primary">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07070d]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 pt-[var(--safe-top,0px)]">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-8 w-8 items-center justify-center rounded-xl border border-line text-muted hover:text-primary">
              <ArrowLeft size={16} />
            </Link>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-black">F</span>
              <span className="font-display text-sm font-bold">FUNBOX Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={me.role === 'ADMIN' ? 'amber' : 'sky'}>{me.role}</Badge>
            <Avatar user={me} size={28} />
          </div>
        </div>
        <div className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 pt-1">
          {visibleTabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition',
                tab === item.value
                  ? 'bg-white/[0.09] text-primary'
                  : 'text-muted hover:bg-white/[0.04] hover:text-primary',
              )}
            >
              <item.icon size={13} />
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {tab === 'overview' && <OverviewTab />}
            {tab === 'users' && <UsersTab isAdmin={me.role === 'ADMIN'} />}
            {tab === 'posts' && <PostsTab />}
            {tab === 'questions' && <QuestionsTab />}
            {tab === 'categories' && <CategoriesTab />}
            {tab === 'quests' && <QuestsTab />}
            {tab === 'achievements' && <AchievementsTab />}
            {tab === 'events' && <EventsTab />}
            {tab === 'reports' && <ReportsTab />}
            {tab === 'transactions' && <TransactionsTab />}
            {tab === 'activity' && <ActivityTab />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function useAdminQuery<T>(key: unknown[], url: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: key,
    queryFn: async () => (await api.get(url, { params })).data.data as T,
  });
}

function OverviewTab() {
  const { data, isLoading } = useAdminQuery<AdminStats>(['admin', 'stats'], '/admin/stats');
  if (isLoading || !data) return <AdminLoading />;

  const maxGames = Math.max(1, ...data.chart.map((day) => day.games));
  const cards = [
    { label: 'Пользователи', value: data.users, sub: `+${data.newUsers} за неделю`, icon: Users, tone: 'from-violet-500/20 to-indigo-500/5' },
    { label: 'Активны сегодня', value: data.activeToday, sub: `${data.activeRooms} комнат в игре`, icon: Activity, tone: 'from-emerald-500/20 to-teal-500/5' },
    { label: 'Публикации', value: data.posts, sub: `${data.messages} сообщений`, icon: Flag, tone: 'from-sky-500/20 to-blue-500/5' },
    { label: 'Игровые сессии', value: data.gamesPlayed, sub: `${data.achievementsUnlocked} достижений`, icon: Gamepad2, tone: 'from-pink-500/20 to-rose-500/5' },
    { label: 'FUN Coins', value: data.coinsSupply, sub: 'в обороте', icon: Coins, tone: 'from-amber-500/20 to-orange-500/5' },
    { label: 'Жалобы', value: data.pendingReports, sub: 'ожидают решения', icon: ShieldAlert, tone: 'from-rose-500/20 to-red-500/5' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Обзор платформы</h1>
        <p className="mt-1 text-xs text-muted">Ключевые метрики за последние 7 дней</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} className="relative overflow-hidden p-4">
            <div className={cn('absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br blur-2xl', card.tone)} />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{card.label}</p>
                <p className="mt-2 font-display text-2xl font-semibold">{formatNumber(card.value)}</p>
                <p className="mt-1 text-[10px] text-muted">{card.sub}</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-muted">
                <card.icon size={16} />
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Активность за неделю</h2>
            <p className="text-[10px] text-muted">Игры и новые пользователи по дням</p>
          </div>
          <BarChart3 size={18} className="text-muted" />
        </div>
        <div className="mt-5 flex h-44 items-end gap-2 sm:gap-4">
          {data.chart.map((day) => (
            <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-32 w-full items-end justify-center gap-1">
                <div
                  className="w-2.5 rounded-t-md bg-gradient-to-t from-violet-600 to-fuchsia-400 sm:w-3"
                  style={{ height: `${Math.max(4, (day.games / maxGames) * 100)}%` }}
                  title={`${day.games} игр`}
                />
                <div
                  className="w-2.5 rounded-t-md bg-gradient-to-t from-sky-600 to-cyan-400 sm:w-3"
                  style={{ height: `${Math.max(4, (day.users / maxGames) * 100)}%` }}
                  title={`${day.users} новых`}
                />
              </div>
              <span className="text-[9px] text-muted">{day.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-[9px] text-muted">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-violet-500" /> игры</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-500" /> новые игроки</span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold">Новые пользователи</h2>
        </div>
        {data.recentUsers.map((user) => (
          <div key={user.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
            <Avatar user={user} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{userName(user)}</p>
              <p className="text-[9px] text-muted">{user.username ? `@${user.username}` : `ID ${user.telegramId}`}</p>
            </div>
            <span className="text-[9px] text-muted">{timeAgo(user.createdAt)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function UsersTab({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [balanceUser, setBalanceUser] = useState<AdminUser | null>(null);
  const [profileUser, setProfileUser] = useState<AdminUser | null>(null);
  const [banUser, setBanUser] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState('Нарушение правил');

  const { data, isLoading } = useAdminQuery<{ users: AdminUser[]; total: number; pages: number }>(
    ['admin', 'users', search, filter, page],
    '/admin/users',
    { q: search || undefined, filter, page },
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const ban = useMutation({
    mutationFn: async (params: { user: AdminUser; banned: boolean; reason?: string }) =>
      api.post(`/admin/users/${params.user.id}/ban`, { banned: params.banned, reason: params.reason }),
    onSuccess: (_result, variables) => {
      toast.success(variables.banned ? 'Пользователь заблокирован' : 'Блокировка снята');
      setBanUser(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const role = useMutation({
    mutationFn: async (params: { user: AdminUser; role: string }) =>
      api.patch(`/admin/users/${params.user.id}/role`, { role: params.role }),
    onSuccess: () => {
      toast.success('Роль обновлена');
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const balance = useMutation({
    mutationFn: async (params: { amount: number; reason: string }) =>
      api.post(`/admin/users/${balanceUser!.id}/balance`, params),
    onSuccess: () => {
      toast.success('Баланс изменён');
      setBalanceUser(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-xl font-semibold">Пользователи</h1>
          <p className="text-xs text-muted">{data?.total ?? 0} аккаунтов</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Имя, @username, ID"
              className="h-9 pl-9 text-xs"
            />
          </div>
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
            className="h-9 rounded-xl border border-line bg-[#12121f] px-2 text-[11px] text-primary outline-none"
          >
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="banned">Заблокированные</option>
            <option value="admins">Команда</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <AdminLoading />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-line text-[9px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3">Игрок</th>
                <th className="px-3 py-3">Роль</th>
                <th className="px-3 py-3">Уровень</th>
                <th className="px-3 py-3">Баланс</th>
                <th className="px-3 py-3">Активность</th>
                <th className="px-3 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((user) => (
                <tr key={user.id} className="border-b border-line/50 text-xs last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={user} size={32} />
                      <div>
                        <p className="font-semibold text-primary">{userName(user)}</p>
                        <p className="text-[9px] text-muted">{user.username ? `@${user.username}` : user.telegramId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {isAdmin ? (
                      <select
                        value={user.role}
                        onChange={(event) => role.mutate({ user, role: event.target.value })}
                        className="rounded-lg border border-line bg-[#12121f] px-1.5 py-1 text-[10px]"
                      >
                        <option value="USER">USER</option>
                        <option value="MODERATOR">MODERATOR</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    ) : (
                      <Badge tone={user.role === 'ADMIN' ? 'amber' : user.role === 'MODERATOR' ? 'sky' : 'neutral'}>{user.role}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted">{user.level}</td>
                  <td className="px-3 py-3 font-semibold text-amber-300">{formatNumber(user.coins)}</td>
                  <td className="px-3 py-3 text-[10px] text-muted">{timeAgo(user.lastActiveAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => setProfileUser(user)}
                            className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-violet-300"
                            title="Редактировать профиль"
                          >
                            <UserCog size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setBalanceUser(user)}
                            className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-amber-300"
                            title="Изменить баланс"
                          >
                            <Coins size={14} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (user.isBanned) ban.mutate({ user, banned: false });
                          else {
                            setBanUser(user);
                            setBanReason('Нарушение правил');
                          }
                        }}
                        className={cn('rounded-lg p-1.5 hover:bg-white/5', user.isBanned ? 'text-emerald-300' : 'text-muted hover:text-rose-300')}
                        title={user.isBanned ? 'Разблокировать' : 'Заблокировать'}
                      >
                        {user.isBanned ? <Check size={14} /> : <Ban size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.users.length === 0 && <EmptyState icon="🔍" title="Никого не нашли" className="py-10" />}
        </Card>
      )}

      <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />

      <Modal open={Boolean(banUser)} onClose={() => setBanUser(null)} title="Блокировка пользователя">
        <div className="space-y-3 pb-2">
          <p className="text-xs text-muted">Пользователь не сможет войти в FUNBOX. Причина будет сохранена.</p>
          <Input label="Причина" value={banReason} onChange={(event) => setBanReason(event.target.value)} />
          <Button variant="danger" fullWidth loading={ban.isPending} onClick={() => banUser && ban.mutate({ user: banUser, banned: true, reason: banReason })}>
            Заблокировать
          </Button>
        </div>
      </Modal>

      <BalanceModal user={balanceUser} onClose={() => setBalanceUser(null)} onConfirm={(amount, reason) => balance.mutate({ amount, reason })} loading={balance.isPending} />
      {profileUser && (
        <ProfileEditor
          key={profileUser.id}
          user={profileUser}
          onClose={() => setProfileUser(null)}
          onSaved={() => {
            setProfileUser(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function ProfileEditor({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName ?? '',
    username: user.username ?? '',
    level: String(user.level),
    xp: String(user.xp),
    coins: String(user.coins),
    role: user.role,
    displayName: user.profile?.displayName ?? '',
    bio: user.profile?.bio ?? '',
    accentColor: user.profile?.accentColor ?? '#8b5cf6',
    bannerUrl: user.profile?.bannerUrl ?? '',
    country: user.profile?.country ?? '',
    gamesPlayed: String(user.stats?.gamesPlayed ?? 0),
    gamesWon: String(user.stats?.gamesWon ?? 0),
  });
  const save = useMutation({
    mutationFn: async () =>
      api.patch(`/admin/users/${user.id}/profile`, {
        firstName: form.firstName,
        lastName: form.lastName || null,
        username: form.username || null,
        level: Number(form.level),
        xp: Number(form.xp),
        coins: Number(form.coins),
        role: form.role,
        displayName: form.displayName || null,
        bio: form.bio || null,
        accentColor: form.accentColor,
        bannerUrl: form.bannerUrl || null,
        country: form.country || null,
        stats: {
          gamesPlayed: Number(form.gamesPlayed),
          gamesWon: Number(form.gamesWon),
        },
      }),
    onSuccess: () => {
      toast.success('Профиль обновлён');
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Управление профилем"
      size="lg"
      footer={<Button fullWidth loading={save.isPending} onClick={() => save.mutate()}>Сохранить профиль</Button>}
    >
      <div className="space-y-3 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <Input label="Имя" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          <Input label="Фамилия" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold text-muted">Роль</span>
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AdminUser['role'] })} className="h-10 w-full rounded-xl border border-line bg-[#12121f] px-2 text-xs">
              <option value="USER">USER</option>
              <option value="MODERATOR">MODERATOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Input label="Уровень" type="number" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} />
          <Input label="XP" type="number" value={form.xp} onChange={(event) => setForm({ ...form, xp: event.target.value })} />
          <Input label="FUN Coins" type="number" value={form.coins} onChange={(event) => setForm({ ...form, coins: event.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Игр сыграно" type="number" value={form.gamesPlayed} onChange={(event) => setForm({ ...form, gamesPlayed: event.target.value })} />
          <Input label="Побед" type="number" value={form.gamesWon} onChange={(event) => setForm({ ...form, gamesWon: event.target.value })} />
        </div>
        <Input label="Отображаемое имя" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold text-muted">Био</span>
          <textarea
            value={form.bio}
            onChange={(event) => setForm({ ...form, bio: event.target.value })}
            className="min-h-[72px] w-full rounded-xl border border-line bg-[#12121f] px-3 py-2 text-xs text-primary outline-none"
            maxLength={300}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Акцент (#hex)" value={form.accentColor} onChange={(event) => setForm({ ...form, accentColor: event.target.value })} />
          <Input label="Страна" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} />
        </div>
        <Input label="Баннер URL" value={form.bannerUrl} onChange={(event) => setForm({ ...form, bannerUrl: event.target.value })} />
      </div>
    </Modal>
  );
}

function PostsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminQuery<{ posts: Array<{ id: string; content: string; imageUrl: string | null; isDeleted: boolean; createdAt: string; author: AdminUser; _count: { likes: number; comments: number; reports: number } }>; total: number; pages: number }>(
    ['admin', 'posts', search, page],
    '/admin/posts',
    { q: search || undefined, page },
  );

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/posts/${id}`),
    onSuccess: () => {
      toast.success('Публикация удалена');
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Публикации</h1>
          <p className="text-xs text-muted">Модерация ленты сообщества</p>
        </div>
        <div className="relative w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Поиск по тексту" className="h-9 pl-9 text-xs" />
        </div>
      </div>
      {isLoading ? <AdminLoading /> : (
        <div className="space-y-2">
          {data?.posts.map((post) => (
            <Card key={post.id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar user={post.author} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold">{userName(post.author)}</p>
                    <span className="text-[9px] text-muted">{timeAgo(post.createdAt)}</span>
                    {post.isDeleted && <Badge tone="rose">удалён</Badge>}
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-[11px] text-muted">{post.content}</p>
                  {post.imageUrl && <img src={assetUrl(post.imageUrl) ?? ''} alt="" className="mt-2 h-20 w-32 rounded-lg object-cover" />}
                  <div className="mt-2 flex items-center gap-3 text-[9px] text-muted">
                    <span>❤️ {post._count.likes}</span>
                    <span>💬 {post._count.comments}</span>
                    {post._count.reports > 0 && <span className="text-rose-300">🚩 {post._count.reports}</span>}
                  </div>
                </div>
                {!post.isDeleted && (
                  <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate(post.id)} icon={<Trash2 size={12} />}>
                    Удалить
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {data?.posts.length === 0 && <Card><EmptyState icon="📝" title="Публикаций нет" className="py-10" /></Card>}
        </div>
      )}
      <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
    </div>
  );
}

function QuestionsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [game, setGame] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = useAdminQuery<{ questions: AdminQuestion[]; total: number; pages: number }>(
    ['admin', 'questions', game, page],
    '/admin/questions',
    { game: game || undefined, page },
  );

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/questions/${id}`),
    onSuccess: () => {
      toast.success('Вопрос деактивирован');
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Игровые вопросы</h1>
          <p className="text-xs text-muted">{data?.total ?? 0} вопросов</p>
        </div>
        <div className="flex gap-2">
          <select
            value={game}
            onChange={(event) => { setGame(event.target.value); setPage(1); }}
            className="h-9 rounded-xl border border-line bg-[#12121f] px-2 text-[11px]"
          >
            <option value="">Все игры</option>
            <option value="quiz-battle">Quiz Battle</option>
            <option value="would-you-rather">Would You Rather</option>
            <option value="guess-image">Guess the Image</option>
          </select>
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} icon={<Plus size={13} />}>Новый</Button>
        </div>
      </div>

      {isLoading ? <AdminLoading /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="border-b border-line text-[9px] uppercase text-muted">
                <th className="px-4 py-3">Вопрос</th>
                <th className="px-3 py-3">Игра</th>
                <th className="px-3 py-3">Категория</th>
                <th className="px-3 py-3">Статус</th>
                <th className="px-3 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {data?.questions.map((question) => (
                <tr key={question.id} className="border-b border-line/50 text-xs last:border-0">
                  <td className="max-w-[320px] px-4 py-3">
                    <p className="line-clamp-2 font-medium">{question.prompt}</p>
                    <p className="mt-1 text-[9px] text-muted">{Array.isArray(question.options) ? (question.options as string[]).join(' · ') : 'JSON'}</p>
                  </td>
                  <td className="px-3 py-3 text-muted">{question.game?.title ?? '—'}</td>
                  <td className="px-3 py-3 text-muted">{question.category?.name ?? '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <Badge tone={question.isActive ? 'emerald' : 'rose'}>{question.isActive ? 'active' : 'off'}</Badge>
                      {!question.isApproved && <Badge tone="amber">на модерации</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => { setEditing(question); setShowForm(true); }} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-primary">
                        <Edit3 size={14} />
                      </button>
                      <button type="button" onClick={() => remove.mutate(question.id)} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-rose-300">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
      <QuestionForm key={editing?.id ?? 'new'} open={showForm} onClose={() => setShowForm(false)} question={editing} />
    </div>
  );
}

function QuestionForm({ open, onClose, question }: { open: boolean; onClose: () => void; question: AdminQuestion | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: games } = useQuery({
    queryKey: ['games', 'admin'],
    queryFn: async () => (await api.get('/games')).data.data as Array<{ id: string; slug: string; title: string }>,
  });
  const { data: categories } = useQuery({
    queryKey: ['categories', 'admin'],
    queryFn: async () => (await api.get('/games/categories')).data.data as Array<{ id: string; name: string; slug: string }>,
  });
  const [form, setForm] = useState({
    gameId: question?.game?.id ?? '',
    categoryId: question?.category?.id ?? '',
    prompt: question?.prompt ?? '',
    options: Array.isArray(question?.options) ? (question?.options as string[]).join('\n') : '',
    correctOption: question?.correctOption ?? 0,
    answerText: question?.answerText ?? '',
    hint: question?.hint ?? '',
    mediaUrl: question?.mediaUrl ?? '',
    difficulty: question?.difficulty ?? 'MEDIUM',
    isApproved: question?.isApproved ?? true,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        gameId: form.gameId || undefined,
        categoryId: form.categoryId || null,
        prompt: form.prompt,
        options: form.options.split('\n').map((line) => line.trim()).filter(Boolean),
        correctOption: Number(form.correctOption),
        answerText: form.answerText || null,
        hint: form.hint || null,
        mediaUrl: form.mediaUrl || null,
        difficulty: form.difficulty,
        isApproved: form.isApproved,
      };
      if (question) await api.patch(`/admin/questions/${question.id}`, payload);
      else await api.post('/admin/questions', payload);
    },
    onSuccess: () => {
      toast.success(question ? 'Вопрос обновлён' : 'Вопрос создан');
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Modal open={open} onClose={onClose} title={question ? 'Редактировать вопрос' : 'Новый вопрос'} size="lg" footer={<Button fullWidth loading={save.isPending} onClick={() => save.mutate()}>Сохранить</Button>}>
      <div className="space-y-3 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold text-muted">Игра</span>
            <select value={form.gameId} onChange={(event) => setForm({ ...form, gameId: event.target.value })} className="h-10 w-full rounded-xl border border-line bg-[#12121f] px-2 text-xs">
              <option value="">Не выбрана</option>
              {games?.map((game) => <option key={game.id} value={game.id}>{game.title}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold text-muted">Категория</span>
            <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} className="h-10 w-full rounded-xl border border-line bg-[#12121f] px-2 text-xs">
              <option value="">Без категории</option>
              {categories?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
        </div>
        <Textarea label="Вопрос" value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} rows={2} />
        <Textarea label="Варианты ответа (по одному в строке)" value={form.options} onChange={(event) => setForm({ ...form, options: event.target.value })} rows={4} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Номер правильного (с 0)" type="number" value={form.correctOption} onChange={(event) => setForm({ ...form, correctOption: Number(event.target.value) })} />
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold text-muted">Сложность</span>
            <select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value as typeof form.difficulty })} className="h-10 w-full rounded-xl border border-line bg-[#12121f] px-2 text-xs">
              <option value="EASY">EASY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HARD">HARD</option>
            </select>
          </label>
        </div>
        <Input label="Текстовый ответ (Guess Image)" value={form.answerText} onChange={(event) => setForm({ ...form, answerText: event.target.value })} />
        <Input label="Подсказка" value={form.hint} onChange={(event) => setForm({ ...form, hint: event.target.value })} />
        <Input label="URL изображения" value={form.mediaUrl} onChange={(event) => setForm({ ...form, mediaUrl: event.target.value })} />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={form.isApproved} onChange={(event) => setForm({ ...form, isApproved: event.target.checked })} />
          Одобрен и опубликован
        </label>
      </div>
    </Modal>
  );
}

function CategoriesTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminQuery<Array<{ id: string; name: string; slug: string; type: string; icon: string | null; isActive: boolean; _count: { questions: number; posts: number; rooms: number } }>>(['admin', 'categories'], '/admin/categories');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', icon: '🎯', type: 'QUIZ' });

  const create = useMutation({
    mutationFn: async () => api.post('/admin/categories', form),
    onSuccess: () => {
      toast.success('Категория создана');
      setOpen(false);
      setForm({ name: '', slug: '', icon: '🎯', type: 'QUIZ' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/categories/${id}`),
    onSuccess: () => {
      toast.success('Категория скрыта');
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Категории</h1>
          <p className="text-xs text-muted">Темы игр, викторин и публикаций</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} icon={<Plus size={13} />}>Создать</Button>
      </div>
      {isLoading ? <AdminLoading /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((category) => (
            <Card key={category.id} className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-lg">{category.icon ?? '🎯'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{category.name}</p>
                <p className="text-[9px] text-muted">{category.type} · {category._count.questions} вопросов · {category._count.posts} постов</p>
              </div>
              <Badge tone={category.isActive ? 'emerald' : 'neutral'}>{category.isActive ? 'on' : 'off'}</Badge>
              <button type="button" onClick={() => remove.mutate(category.id)} className="rounded-lg p-1 text-muted hover:text-rose-300"><Trash2 size={13} /></button>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Новая категория" footer={<Button fullWidth loading={create.isPending} onClick={() => create.mutate()}>Создать</Button>}>
        <div className="space-y-3 pb-2">
          <Input label="Название" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <Input label="Slug (латиница)" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
          <Input label="Иконка (emoji)" value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} />
          <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="h-10 w-full rounded-xl border border-line bg-[#12121f] px-2 text-xs">
            <option value="QUIZ">QUIZ</option>
            <option value="POST">POST</option>
            <option value="GAME">GAME</option>
            <option value="SHOP">SHOP</option>
          </select>
        </div>
      </Modal>
    </div>
  );
}

function QuestsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminQuery<Array<{ id: string; code: string; title: string; description: string; icon: string; period: string; metric: string; target: number; xpReward: number; coinReward: number; isActive: boolean; _count: { users: number } }>>(['admin', 'quests'], '/admin/quests');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', title: '', description: '', icon: '🎯', period: 'DAILY', metric: 'GAMES_PLAYED', target: 1, xpReward: 20, coinReward: 10 });

  const create = useMutation({
    mutationFn: async () => api.post('/admin/quests', { ...form, target: Number(form.target), xpReward: Number(form.xpReward), coinReward: Number(form.coinReward) }),
    onSuccess: () => {
      toast.success('Задание создано');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'quests'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/quests/${id}`),
    onSuccess: () => {
      toast.success('Задание отключено');
      queryClient.invalidateQueries({ queryKey: ['admin', 'quests'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Задания</h1>
          <p className="text-xs text-muted">Ежедневные, недельные и особые квесты</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} icon={<Plus size={13} />}>Создать</Button>
      </div>
      {isLoading ? <AdminLoading /> : (
        <div className="space-y-2">
          {data?.map((quest) => (
            <Card key={quest.id} className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-lg">{quest.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{quest.title}</p>
                <p className="text-[9px] text-muted">{quest.period} · {quest.metric} · цель {quest.target} · {quest._count.users} участников</p>
              </div>
              <div className="text-right text-[9px]">
                <p className="text-violet-300">+{quest.xpReward} XP</p>
                <p className="text-amber-300">+{quest.coinReward} F</p>
              </div>
              <button type="button" onClick={() => remove.mutate(quest.id)} className="rounded-lg p-1 text-muted hover:text-rose-300"><Trash2 size={13} /></button>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Новое задание" footer={<Button fullWidth loading={create.isPending} onClick={() => create.mutate()}>Создать</Button>}>
        <div className="space-y-2.5 pb-2">
          <Input label="Код" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="daily-new-quest" />
          <Input label="Название" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <Input label="Описание" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Иконка" value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} />
            <select value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} className="mt-5 h-10 rounded-xl border border-line bg-[#12121f] px-2 text-xs">
              <option value="DAILY">DAILY</option>
              <option value="WEEKLY">WEEKLY</option>
              <option value="ONBOARDING">ONBOARDING</option>
              <option value="SPECIAL">SPECIAL</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.metric} onChange={(event) => setForm({ ...form, metric: event.target.value })} className="h-10 rounded-xl border border-line bg-[#12121f] px-2 text-xs">
              {['GAMES_PLAYED', 'GAMES_WON', 'QUIZ_WINS', 'FRIENDS_ADDED', 'POSTS_CREATED', 'MESSAGES_SENT', 'REFERRALS', 'WYR_VOTES'].map((metric) => <option key={metric}>{metric}</option>)}
            </select>
            <Input label="Цель" type="number" value={form.target} onChange={(event) => setForm({ ...form, target: Number(event.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="XP" type="number" value={form.xpReward} onChange={(event) => setForm({ ...form, xpReward: Number(event.target.value) })} />
            <Input label="Coins" type="number" value={form.coinReward} onChange={(event) => setForm({ ...form, coinReward: Number(event.target.value) })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AchievementsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminQuery<Array<{ id: string; code: string; name: string; description: string; icon: string; rarity: string; metric: string | null; threshold: number; xpReward: number; coinReward: number; isActive: boolean; _count: { users: number } }>>(['admin', 'achievements'], '/admin/achievements');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '', icon: '🏆', rarity: 'COMMON', metric: 'GAMES_PLAYED', threshold: 1, xpReward: 20, coinReward: 10 });

  const create = useMutation({
    mutationFn: async () => api.post('/admin/achievements', { ...form, threshold: Number(form.threshold), xpReward: Number(form.xpReward), coinReward: Number(form.coinReward) }),
    onSuccess: () => {
      toast.success('Достижение создано');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'achievements'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/achievements/${id}`),
    onSuccess: () => {
      toast.success('Достижение отключено');
      queryClient.invalidateQueries({ queryKey: ['admin', 'achievements'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Достижения</h1>
          <p className="text-xs text-muted">Награды и условия разблокировки</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} icon={<Plus size={13} />}>Создать</Button>
      </div>
      {isLoading ? <AdminLoading /> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {data?.map((achievement) => (
            <Card key={achievement.id} className="flex items-center gap-3 p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl text-xl" style={{ background: `${rarityColor[achievement.rarity]}18` }}>{achievement.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{achievement.name}</p>
                <p className="text-[9px] text-muted">{achievement.rarity} · {achievement.metric ?? '—'} ≥ {achievement.threshold} · {achievement._count.users} получили</p>
              </div>
              <div className="text-right text-[9px]">
                <p className="text-violet-300">+{achievement.xpReward} XP</p>
                <p className="text-amber-300">+{achievement.coinReward} F</p>
              </div>
              <button type="button" onClick={() => remove.mutate(achievement.id)} className="rounded-lg p-1 text-muted hover:text-rose-300"><Trash2 size={13} /></button>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Новое достижение" footer={<Button fullWidth loading={create.isPending} onClick={() => create.mutate()}>Создать</Button>}>
        <div className="space-y-2.5 pb-2">
          <Input label="Код" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          <Input label="Название" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <Input label="Описание" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Иконка" value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} />
            <select value={form.rarity} onChange={(event) => setForm({ ...form, rarity: event.target.value })} className="mt-5 h-10 rounded-xl border border-line bg-[#12121f] px-2 text-xs">
              {['COMMON', 'RARE', 'EPIC', 'LEGENDARY'].map((rarity) => <option key={rarity}>{rarity}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Метрика" value={form.metric} onChange={(event) => setForm({ ...form, metric: event.target.value })} />
            <Input label="Порог" type="number" value={form.threshold} onChange={(event) => setForm({ ...form, threshold: Number(event.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="XP" type="number" value={form.xpReward} onChange={(event) => setForm({ ...form, xpReward: Number(event.target.value) })} />
            <Input label="Coins" type="number" value={form.coinReward} onChange={(event) => setForm({ ...form, coinReward: Number(event.target.value) })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function EventsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminQuery<Array<{ id: string; title: string; description: string; icon: string; rewardXp: number; rewardCoins: number; startsAt: string; endsAt: string; isActive: boolean }>>(['admin', 'events'], '/admin/events');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', icon: '✨', rewardXp: 50, rewardCoins: 25, startsAt: new Date().toISOString().slice(0, 16), endsAt: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16) });
  const create = useMutation({
    mutationFn: async () => api.post('/admin/events', { ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() }),
    onSuccess: () => {
      toast.success('Событие создано');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/events/${id}`),
    onSuccess: () => { toast.success('Событие скрыто'); queryClient.invalidateQueries({ queryKey: ['admin', 'events'] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="font-display text-xl font-semibold">События</h1><p className="text-xs text-muted">Активные баннеры на главной</p></div>
        <Button size="sm" onClick={() => setOpen(true)} icon={<Plus size={13} />}>Создать</Button>
      </div>
      {isLoading ? <AdminLoading /> : (
        <div className="space-y-2">
          {data?.map((event) => (
            <Card key={event.id} className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-lg">{event.icon}</span>
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold">{event.title}</p><p className="text-[9px] text-muted">{formatDate(event.startsAt)} — {formatDate(event.endsAt)}</p></div>
              <div className="text-right text-[9px]"><p className="text-violet-300">+{event.rewardXp} XP</p><p className="text-amber-300">+{event.rewardCoins} F</p></div>
              <Badge tone={event.isActive ? 'emerald' : 'neutral'}>{event.isActive ? 'on' : 'off'}</Badge>
              <button type="button" onClick={() => remove.mutate(event.id)} className="p-1 text-muted hover:text-rose-300"><Trash2 size={13} /></button>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Новое событие" footer={<Button fullWidth loading={create.isPending} onClick={() => create.mutate()}>Создать</Button>}>
        <div className="space-y-2.5 pb-2">
          <Input label="Заголовок" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <Textarea label="Описание" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} />
          <div className="grid grid-cols-2 gap-2"><Input label="Иконка" value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} /><Input label="XP" type="number" value={form.rewardXp} onChange={(event) => setForm({ ...form, rewardXp: Number(event.target.value) })} /></div>
          <Input label="Coins" type="number" value={form.rewardCoins} onChange={(event) => setForm({ ...form, rewardCoins: Number(event.target.value) })} />
          <Input label="Начало" type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          <Input label="Конец" type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

function ReportsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const { data, isLoading } = useAdminQuery<{ reports: Array<{ id: string; reason: string; details: string | null; status: string; createdAt: string; reporter: AdminUser; reportedUser: AdminUser | null; targetPost: { id: string; content: string; imageUrl: string | null; author: AdminUser } | null }> }>(
    ['admin', 'reports', status],
    '/admin/reports',
    { status },
  );
  const resolve = useMutation({
    mutationFn: async (params: { id: string; action: string; status: 'RESOLVED' | 'DISMISSED'; note?: string }) =>
      api.post(`/admin/reports/${params.id}/resolve`, params),
    onSuccess: () => {
      toast.success('Жалоба обработана');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-display text-xl font-semibold">Жалобы</h1><p className="text-xs text-muted">Модерация контента и пользователей</p></div>
        <div className="flex gap-1 rounded-xl border border-line bg-surface/60 p-1">
          {[['PENDING', 'Ожидают'], ['RESOLVED', 'Решены'], ['ALL', 'Все']].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setStatus(value)} className={cn('rounded-lg px-2.5 py-1.5 text-[10px] font-semibold', status === value ? 'bg-violet-500/20 text-violet-200' : 'text-muted')}>{label}</button>
          ))}
        </div>
      </div>
      {isLoading ? <AdminLoading /> : data?.reports.length === 0 ? (
        <Card><EmptyState icon="🛡️" title="Жалоб нет" text="Сообщество ведёт себя хорошо." className="py-10" /></Card>
      ) : (
        <div className="space-y-2">
          {data?.reports.map((report) => (
            <Card key={report.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300"><ShieldAlert size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold">{report.reason}</p>
                    <Badge tone={report.status === 'PENDING' ? 'amber' : report.status === 'RESOLVED' ? 'emerald' : 'neutral'}>{report.status}</Badge>
                    <span className="text-[9px] text-muted">{timeAgo(report.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted">От: {userName(report.reporter)} · На: {report.reportedUser ? userName(report.reportedUser) : report.targetPost ? userName(report.targetPost.author) : '—'}</p>
                  {report.details && <p className="mt-1 rounded-lg bg-white/[0.03] p-2 text-[10px] text-muted">«{report.details}»</p>}
                  {report.targetPost && <p className="mt-1 line-clamp-2 text-[10px] text-muted">Пост: {report.targetPost.content}</p>}
                  {report.status === 'PENDING' && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {report.targetPost && (
                        <Button size="sm" variant="danger" loading={resolve.isPending} onClick={() => resolve.mutate({ id: report.id, action: 'deletePost', status: 'RESOLVED' })}>Удалить пост</Button>
                      )}
                      {report.targetPost && (
                        <Button size="sm" variant="secondary" onClick={() => resolve.mutate({ id: report.id, action: 'none', status: 'DISMISSED' })}>Отклонить</Button>
                      )}
                      {report.reportedUser && (
                        <Button size="sm" variant="secondary" onClick={() => resolve.mutate({ id: report.id, action: 'banUser', status: 'RESOLVED', note: report.reason })}>Заблокировать</Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TransactionsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminQuery<{ transactions: Array<{ id: string; amount: number; type: string; description: string; createdAt: string; user: AdminUser }>; total: number }>(
    ['admin', 'transactions', page],
    '/admin/transactions',
    { page },
  );
  return (
    <div className="space-y-4">
      <div><h1 className="font-display text-xl font-semibold">Экономика</h1><p className="text-xs text-muted">{data?.total ?? 0} транзакций</p></div>
      {isLoading ? <AdminLoading /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left">
            <thead><tr className="border-b border-line text-[9px] uppercase text-muted"><th className="px-4 py-3">Игрок</th><th className="px-3 py-3">Операция</th><th className="px-3 py-3">Тип</th><th className="px-3 py-3">Дата</th><th className="px-3 py-3 text-right">Сумма</th></tr></thead>
            <tbody>
              {data?.transactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-line/50 text-xs last:border-0">
                  <td className="px-4 py-2.5"><div className="flex items-center gap-2"><Avatar user={transaction.user} size={24} /><span>{userName(transaction.user)}</span></div></td>
                  <td className="px-3 py-2.5 text-muted">{transaction.description}</td>
                  <td className="px-3 py-2.5"><Badge tone="neutral">{transaction.type}</Badge></td>
                  <td className="px-3 py-2.5 text-[10px] text-muted">{formatDate(transaction.createdAt)}</td>
                  <td className={cn('px-3 py-2.5 text-right font-bold', transaction.amount > 0 ? 'text-emerald-300' : 'text-rose-300')}>{transaction.amount > 0 ? '+' : ''}{transaction.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pages={Math.ceil((data?.total ?? 0) / 25)} onChange={setPage} />
    </div>
  );
}

function ActivityTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminQuery<{ activity: Array<{ id: string; action: string; metadata: unknown; ip: string | null; createdAt: string; user: AdminUser | null }>; total: number }>(
    ['admin', 'activity', page],
    '/admin/activity',
    { page },
  );
  return (
    <div className="space-y-4">
      <div><h1 className="font-display text-xl font-semibold">Активность</h1><p className="text-xs text-muted">Аудит действий на платформе</p></div>
      {isLoading ? <AdminLoading /> : (
        <Card className="divide-y divide-line/50 overflow-hidden">
          {data?.activity.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] text-muted"><Activity size={12} /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium">{entry.action}</p><p className="text-[9px] text-muted">{entry.user ? userName(entry.user) : 'system'} · {entry.ip ?? '—'}</p></div>
              <span className="text-[9px] text-muted">{formatDate(entry.createdAt)}</span>
            </div>
          ))}
        </Card>
      )}
      <Pagination page={page} pages={Math.ceil((data?.total ?? 0) / 30)} onChange={setPage} />
    </div>
  );
}

function BalanceModal({ user, onClose, onConfirm, loading }: { user: AdminUser | null; onClose: () => void; onConfirm: (amount: number, reason: string) => void; loading: boolean }) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('Корректировка баланса');
  return (
    <Modal open={Boolean(user)} onClose={onClose} title="Изменить баланс">
      <div className="space-y-3 pb-2">
        {user && <p className="text-xs text-muted">{userName(user)} · текущий баланс {formatNumber(user.coins)} FUN</p>}
        <Input label="Сумма (+ начислить, − списать)" type="number" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        <Input label="Причина" value={reason} onChange={(event) => setReason(event.target.value)} />
        <Button fullWidth loading={loading} onClick={() => onConfirm(amount, reason)}>Применить</Button>
      </div>
    </Modal>
  );
}

function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={14} /></Button>
      <span className="text-[10px] text-muted">{page} / {pages}</span>
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={14} /></Button>
    </div>
  );
}

function AdminLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <RefreshCw size={20} className="animate-spin text-muted" />
    </div>
  );
}
