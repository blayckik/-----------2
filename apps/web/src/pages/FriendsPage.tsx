import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Check,
  Copy,
  Gift,
  MessageCircle,
  Search,
  Send,
  Share2,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { haptic, shareInvite } from '../lib/telegram';
import { cn, userName } from '../lib/utils';
import type { UserCard } from '../types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageSkeleton,
  Tabs,
} from '../components/ui';

type Tab = 'friends' | 'incoming' | 'outgoing' | 'suggestions' | 'search';

interface FriendRequest {
  id: string;
  message?: string | null;
  createdAt: string;
  sender?: UserCard;
  receiver?: UserCard;
}

interface SearchUser extends UserCard {
  relationship: 'friend' | 'outgoing' | 'incoming' | 'none';
}

export function FriendsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('friends');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDeferredValue(search);

  const { data: friends, isLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await api.get('/friends')).data.data as UserCard[],
  });
  const { data: requests } = useQuery({
    queryKey: ['friends', 'requests'],
    queryFn: async () =>
      (await api.get('/friends/requests')).data.data as {
        incoming: FriendRequest[];
        outgoing: FriendRequest[];
      },
  });
  const { data: suggestions } = useQuery({
    queryKey: ['friends', 'suggestions'],
    queryFn: async () => (await api.get('/friends/suggestions')).data.data as UserCard[],
  });
  const { data: invite } = useQuery({
    queryKey: ['friends', 'invite'],
    queryFn: async () =>
      (await api.get('/friends/invite')).data.data as {
        link: string;
        appLink: string;
        shareText: string;
        referralCode: string;
        rewards: { inviterCoins: number; inviterXp: number; invitedCoins: number };
      },
  });
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['friends', 'search', debouncedSearch],
    queryFn: async () =>
      (await api.get('/friends/search', { params: { q: debouncedSearch } })).data.data as SearchUser[],
    enabled: debouncedSearch.trim().length >= 2,
  });

  useEffect(() => {
    if ((requests?.incoming.length ?? 0) > 0 && tab === 'friends') {
      const seen = sessionStorage.getItem('funbox:requests-seen');
      if (!seen) {
        setTab('incoming');
        sessionStorage.setItem('funbox:requests-seen', '1');
      }
    }
  }, [requests?.incoming.length, tab]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['friends'] });
    queryClient.invalidateQueries({ queryKey: ['social'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const accept = useMutation({
    mutationFn: async (id: string) => api.post(`/friends/requests/${id}/accept`),
    onSuccess: () => {
      haptic('success');
      toast.success('Теперь вы друзья!');
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const decline = useMutation({
    mutationFn: async (id: string) => api.post(`/friends/requests/${id}/decline`),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => api.delete(`/friends/requests/${id}`),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/friends/${id}`),
    onSuccess: () => {
      toast.success('Пользователь удалён из друзей');
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const sendRequest = useMutation({
    mutationFn: async (id: string) => api.post('/friends/request', { userId: id }),
    onSuccess: () => {
      haptic('success');
      toast.success('Заявка отправлена');
      queryClient.invalidateQueries({ queryKey: ['friends', 'search'] });
      queryClient.invalidateQueries({ queryKey: ['friends', 'suggestions'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const openChat = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post('/chat/conversations', { userId: id });
      return response.data.data as { id: string };
    },
    onSuccess: (conversation) => navigate(`/chat/${conversation.id}`),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const incoming = requests?.incoming ?? [];
  const outgoing = requests?.outgoing ?? [];

  return (
    <div className="space-y-5 px-4 pt-4">
      <div className="relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-gradient-to-br from-[#0b3330] via-[#0d1e28] to-[#080d13] p-5">
        <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-emerald-500/20 blur-[60px]" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200/70">
            <Users size={13} /> Social graph
          </div>
          <h1 className="mt-2 font-display text-[25px] font-semibold text-white">Друзья</h1>
          <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-white/55">
            Собирайте команду, играйте вместе и открывайте новые имена.
          </p>
          <div className="mt-3 flex gap-2">
            <Badge tone="emerald">{friends?.length ?? 0} друзей</Badge>
            <Badge tone="amber">{incoming.length} заявок</Badge>
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(value) => {
          setTab(value);
          haptic('selection');
        }}
        size="sm"
        options={[
          { value: 'friends', label: `Друзья${friends?.length ? ` ${friends.length}` : ''}` },
          { value: 'incoming', label: `Входящие${incoming.length ? ` ${incoming.length}` : ''}` },
          { value: 'outgoing', label: 'Исходящие' },
          { value: 'suggestions', label: 'Найти' },
        ]}
      />

      {tab === 'friends' &&
        (isLoading ? (
          <PageSkeleton />
        ) : friends && friends.length > 0 ? (
          <div className="space-y-2">
            {friends.map((friend) => (
              <Card key={friend.id} className="flex items-center gap-3 p-3">
                <button type="button" onClick={() => navigate(`/profile/${friend.id}`)}>
                  <Avatar
                    user={friend}
                    size={44}
                    online={friend.lastActiveAt ? Date.now() - new Date(friend.lastActiveAt).getTime() < 15 * 60_000 : false}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/profile/${friend.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[13px] font-semibold text-primary">{userName(friend)}</p>
                  <p className="text-[10px] text-muted">
                    Ур. {friend.level}
                    {friend.stats?.gamesWon ? ` · ${friend.stats.gamesWon} побед` : ''}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => openChat.mutate(friend.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-muted transition hover:text-primary"
                  aria-label="Написать"
                >
                  <MessageCircle size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Удалить ${userName(friend)} из друзей?`)) remove.mutate(friend.id);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-muted transition hover:border-rose-400/30 hover:text-rose-300"
                  aria-label="Удалить"
                >
                  <X size={16} />
                </button>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-2">
            <EmptyState
              icon="👋"
              title="Пока нет друзей"
              text="Найдите игроков в поиске или пригласите друга по ссылке."
              action={<Button onClick={() => setTab('suggestions')} icon={<UserPlus size={15} />}>Найти игроков</Button>}
            />
          </Card>
        ))}

      {tab === 'incoming' && (
        <div className="space-y-2">
          {incoming.length === 0 ? (
            <Card className="p-2">
              <EmptyState icon="📭" title="Входящих заявок нет" text="Когда кто-то захочет добавить вас, заявка появится здесь." className="py-8" />
            </Card>
          ) : (
            incoming.map((request) => (
              <Card key={request.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar user={request.sender} size={44} />
                  <button
                    type="button"
                    onClick={() => request.sender && navigate(`/profile/${request.sender.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[13px] font-semibold text-primary">{userName(request.sender)}</p>
                    <p className="text-[10px] text-muted">@{request.sender?.username ?? 'funbox'}</p>
                  </button>
                </div>
                {request.message && (
                  <p className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] text-muted">«{request.message}»</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => decline.mutate(request.id)} icon={<X size={14} />}>
                    Отклонить
                  </Button>
                  <Button size="sm" onClick={() => accept.mutate(request.id)} icon={<Check size={14} />}>
                    Принять
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'outgoing' && (
        <div className="space-y-2">
          {outgoing.length === 0 ? (
            <Card className="p-2">
              <EmptyState icon="✉️" title="Исходящих заявок нет" text="Найдите игроков и отправьте заявку в друзья." className="py-8" />
            </Card>
          ) : (
            outgoing.map((request) => (
              <Card key={request.id} className="flex items-center gap-3 p-3">
                <Avatar user={request.receiver} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-primary">{userName(request.receiver)}</p>
                  <p className="text-[10px] text-muted">Ожидает ответа</p>
                </div>
                <Badge tone="amber">pending</Badge>
                <Button size="sm" variant="ghost" onClick={() => cancel.mutate(request.id)}>
                  Отменить
                </Button>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'suggestions' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по имени или @username"
              className="h-11 pl-10"
            />
          </div>

          {search.trim().length >= 2 ? (
            <div className="space-y-2">
              {searching ? (
                <div className="flex justify-center py-8">
                  <Sparkles className="animate-pulse text-muted" size={20} />
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((user) => (
                  <SearchRow
                    key={user.id}
                    user={user}
                    onProfile={() => navigate(`/profile/${user.id}`)}
                    onAdd={() => sendRequest.mutate(user.id)}
                    onChat={user.relationship === 'friend' ? () => openChat.mutate(user.id) : undefined}
                  />
                ))
              ) : (
                <Card className="p-2">
                  <EmptyState icon="🔍" title="Никого не нашли" text="Попробуйте другое имя или username." className="py-8" />
                </Card>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-primary">Рекомендации</p>
                <span className="text-[10px] text-muted">{suggestions?.length ?? 0} игроков</span>
              </div>
              <div className="space-y-2">
                {suggestions?.map((user) => (
                  <Card key={user.id} className="flex items-center gap-3 p-3">
                    <button type="button" onClick={() => navigate(`/profile/${user.id}`)}>
                      <Avatar user={user} size={42} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/profile/${user.id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs font-semibold text-primary">{userName(user)}</p>
                      <p className="text-[10px] text-muted">
                        Ур. {user.level} {user.stats?.gamesPlayed ? `· ${user.stats.gamesPlayed} игр` : ''}
                      </p>
                    </button>
                    <Button size="sm" variant="secondary" onClick={() => sendRequest.mutate(user.id)} icon={<UserPlus size={13} />}>
                      Добавить
                    </Button>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {invite && (
        <Card className="relative overflow-hidden p-4">
          <div className="absolute -right-8 -top-10 text-7xl opacity-[0.07]">🎁</div>
          <div className="relative flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/25 to-orange-500/10 text-amber-300">
              <Gift size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-primary">Пригласите друга</h3>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                Вы получите +{invite.rewards.inviterCoins} FUN и +{invite.rewards.inviterXp} XP, а друг — {invite.rewards.invitedCoins} FUN на старте.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(invite.link);
                    toast.success('Ссылка скопирована');
                  }}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-white/[0.04] text-[10px] font-semibold text-muted transition hover:text-primary"
                >
                  <Copy size={13} /> Копировать
                </button>
                <button
                  type="button"
                  onClick={() => shareInvite(invite.link, invite.shareText)}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-[10px] font-bold text-white"
                >
                  <Share2 size={13} /> Поделиться
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function SearchRow({
  user,
  onProfile,
  onAdd,
  onChat,
}: {
  user: SearchUser;
  onProfile: () => void;
  onAdd: () => void;
  onChat?: () => void;
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <button type="button" onClick={onProfile}>
        <Avatar user={user} size={42} />
      </button>
      <button type="button" onClick={onProfile} className="min-w-0 flex-1 text-left">
        <p className="truncate text-xs font-semibold text-primary">{userName(user)}</p>
        <p className="text-[10px] text-muted">
          {user.username ? `@${user.username}` : `Ур. ${user.level}`}
        </p>
      </button>
      {user.relationship === 'friend' ? (
        <div className="flex items-center gap-1.5">
          <Badge tone="emerald"><UserCheck size={10} /> друг</Badge>
          {onChat && (
            <button
              type="button"
              onClick={onChat}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted"
            >
              <MessageCircle size={14} />
            </button>
          )}
        </div>
      ) : user.relationship === 'outgoing' ? (
        <Badge tone="amber">заявка отправлена</Badge>
      ) : user.relationship === 'incoming' ? (
        <Badge tone="sky">входящая</Badge>
      ) : (
        <Button size="sm" variant="secondary" onClick={onAdd} icon={<Send size={12} />}>
          Добавить
        </Button>
      )}
    </Card>
  );
}
