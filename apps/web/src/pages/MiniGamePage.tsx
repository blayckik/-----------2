import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  Crown,
  DoorOpen,
  KeyRound,
  Loader2,
  Lock,
  Play,
  Radio,
  Share2,
  Sparkles,
  Timer,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, BOT_USERNAME, getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { haptic, shareInvite } from '../lib/telegram';
import { cn, formatNumber } from '../lib/utils';
import type { Game } from '../types';
import { Badge, Button, Card, Input, Modal, Spinner } from '../components/ui';

type Slug = 'word-bomb' | 'bluff-trivia' | 'converge' | 'auction' | 'minefield';

interface Config {
  slug: Slug;
  prefix: string;
  title: string;
  icon: string;
  subtitle: string;
  min: number;
  max: number;
  rules: string;
}

const CONFIG: Record<Slug, Config> = {
  'word-bomb': {
    slug: 'word-bomb',
    prefix: 'bomb',
    title: 'Словесная бомба',
    icon: '💣',
    subtitle: 'Слова на время',
    min: 2,
    max: 8,
    rules: 'У каждого 3 жизни. В свой ход назови слово со слогом на экране. Не успел — минус жизнь.',
  },
  'bluff-trivia': {
    slug: 'bluff-trivia',
    prefix: 'bluff',
    title: 'Блеф-викторина',
    icon: '🎭',
    subtitle: 'Придумай правду',
    min: 3,
    max: 8,
    rules: 'Придумай правдоподобный ответ, затем угадай настоящий. За обман и правильный выбор — очки.',
  },
  converge: {
    slug: 'converge',
    prefix: 'converge',
    title: 'На одной волне',
    icon: '🧠',
    subtitle: 'Ассоциации на двоих',
    min: 2,
    max: 2,
    rules: 'Два слова — одна ассоциация. Напишите одно слово одновременно. Совпали — победа.',
  },
  auction: {
    slug: 'auction',
    prefix: 'auction',
    title: 'Аукцион',
    icon: '🎯',
    subtitle: 'Ближе к цели',
    min: 2,
    max: 10,
    rules: 'Введи число. Нельзя перебивать правильный ответ. Ближайший снизу получает очки.',
  },
  minefield: {
    slug: 'minefield',
    prefix: 'mine',
    title: 'Минное поле',
    icon: '💥',
    subtitle: 'Открой безопасное',
    min: 2,
    max: 6,
    rules: '16 карточек, 4 мины. По очереди открывай карточки. Мина — выбывание.',
  },
};

interface Member {
  participantId: string;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  score: number;
  alive?: boolean;
  lives?: number;
  connected?: boolean;
}

interface RoomState {
  roomId?: string;
  code: string;
  gameSlug?: string;
  hostId: string;
  phase: string;
  members: Member[];
  [key: string]: any;
}

interface FinishedState {
  leaderboard: Array<Member & { place: number; isWinner: boolean }>;
  rewards: Array<{ userId: string; xp: number; coins: number; place: number }>;
  gameSlug?: string;
  details?: Record<string, unknown>;
}

interface OpenRoom {
  id: string;
  code: string;
  maxPlayers: number;
  host: { firstName: string; username?: string | null; avatarUrl?: string | null };
  participants: Array<{ id: string }>;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function secondsLeft(endsAt: unknown, now: number) {
  if (typeof endsAt !== 'number') return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function AvatarDot({ member, size = 34 }: { member: Member; size?: number }) {
  const initial = member.name.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-violet-500/40 to-cyan-500/30 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
      {member.connected === false && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/65 text-[8px] text-white/80">
          offline
        </span>
      )}
    </span>
  );
}

function PlayerChips({ room, meId }: { room: RoomState; meId?: string }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {room.members.map((member) => (
        <div
          key={member.participantId}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-2xl border px-2.5 py-2',
            member.userId === meId
              ? 'border-violet-400/40 bg-violet-500/10'
              : 'border-line bg-white/[0.03]',
            member.alive === false && 'opacity-45',
          )}
        >
          <AvatarDot member={member} size={28} />
          <div className="min-w-0">
            <p className="max-w-[92px] truncate text-[10px] font-bold text-primary">{member.name}</p>
            <p className="text-[9px] text-muted">
              {formatNumber(member.score)} очк.
              {typeof member.lives === 'number' && member.lives > 0 ? ` · ${'♥'.repeat(member.lives)}` : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Countdown({ endsAt, now }: { endsAt: unknown; now: number }) {
  const seconds = secondsLeft(endsAt, now);
  useEffect(() => {
    if (seconds !== null && seconds > 0 && seconds <= 3) haptic('light');
  }, [seconds]);
  if (seconds === null) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tabular-nums',
        seconds <= 5
          ? 'border-rose-400/40 bg-rose-500/15 text-rose-300'
          : 'border-white/15 bg-black/20 text-white/80',
      )}
    >
      <Timer size={12} /> {seconds} сек
    </span>
  );
}

export function MiniGamePage({ slug }: { slug: Slug }) {
  const config = CONFIG[slug];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = (searchParams.get('code') ?? '').toUpperCase();
  const { me } = useAuth();
  const { socket, connected, emitAck } = useSocket();
  const toast = useToast();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [finished, setFinished] = useState<FinishedState | null>(null);
  const [isPrivate, setIsPrivate] = useState(true);
  const [joinCode, setJoinCode] = useState(codeFromUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ link: string; code: string; sent: number } | null>(null);
  const autoJoinRef = useRef(false);

  const now = useNow(Boolean(room && room.phase !== 'lobby'));

  const { data: games } = useQuery({
    queryKey: ['games'],
    queryFn: async () => (await api.get('/games')).data.data as Game[],
  });
  const gameMeta = games?.find((game) => game.slug === slug);

  const { data: openRooms } = useQuery({
    queryKey: ['mini-rooms', slug],
    queryFn: async () => (await api.get(`/games/mini/rooms?game=${slug}`)).data.data as OpenRoom[],
    refetchInterval: 8_000,
    enabled: !room,
  });

  useEffect(() => {
    if (!socket) return;
    const onState = (next: RoomState) => {
      setRoom(next);
      setFinished(null);
    };
    const onFinished = (next: FinishedState) => {
      setFinished(next);
      setRoom((current) => (current ? { ...current, phase: 'finished' } : current));
      const mine = next.leaderboard.find((entry) => entry.userId === me?.id);
      if (mine?.isWinner) haptic('success');
    };
    const onBombExploded = () => {
      haptic('error');
      toast.info('Бомба взорвалась — минус жизнь');
    };
    const onMineExplosion = () => {
      haptic('error');
      toast.info('Мина! Игрок выбыл');
    };
    socket.on(`${config.prefix}:state`, onState);
    socket.on(`${config.prefix}:finished`, onFinished);
    if (slug === 'word-bomb') socket.on('bomb:exploded', onBombExploded);
    if (slug === 'minefield') socket.on('mine:explosion', onMineExplosion);
    return () => {
      socket.off(`${config.prefix}:state`, onState);
      socket.off(`${config.prefix}:finished`, onFinished);
      socket.off('bomb:exploded', onBombExploded);
      socket.off('mine:explosion', onMineExplosion);
    };
  }, [config.prefix, me?.id, slug, socket, toast]);

  useEffect(() => {
    if (room) return;
    setJoinCode(codeFromUrl);
  }, [codeFromUrl, room]);

  useEffect(() => {
    if (!connected || !codeFromUrl || room || autoJoinRef.current) return;
    autoJoinRef.current = true;
    void join(codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, codeFromUrl, room]);

  const myMember = room?.members.find((member) => member.userId === me?.id) ?? null;

  async function createRoom() {
    setBusy('create');
    try {
      const result = await emitAck<{ room?: RoomState; error?: string }>(`${config.prefix}:create`, { isPrivate });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result?.room) setRoom(result.room);
      haptic('success');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function join(rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (code.length < 4) {
      toast.error('Введите код комнаты');
      return;
    }
    setBusy('join');
    try {
      const result = await emitAck<{ joined?: boolean; error?: string }>(`${config.prefix}:join`, { code });
      if (result?.error) {
        toast.error(result.error);
        autoJoinRef.current = false;
        return;
      }
      haptic('success');
    } catch (error) {
      toast.error(getErrorMessage(error));
      autoJoinRef.current = false;
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (!room) return;
    setBusy('start');
    try {
      const result = await emitAck<{ started?: boolean; error?: string }>(`${config.prefix}:start`, {
        code: room.code,
      });
      if (result?.error) toast.error(result.error);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    if (!room) return;
    setBusy('leave');
    try {
      await emitAck(`${config.prefix}:leave`, { code: room.code });
    } catch {
      // leave is best-effort
    } finally {
      setRoom(null);
      setFinished(null);
      setBusy(null);
      navigate(`/games/${slug}`, { replace: true });
    }
  }

  function roomLink() {
    if (!room) return '';
    return `https://t.me/${BOT_USERNAME}?startapp=room_${room.code}`;
  }

  async function copyInvite() {
    if (!room) return;
    const link = roomLink();
    try {
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      haptic('success');
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      shareInvite(link, `Играем в ${config.title} в FUNBOX`);
    }
  }

  function shareRoom() {
    if (!room) return;
    haptic('light');
    shareInvite(roomLink(), `Играем в ${config.title} в FUNBOX. Комната ${room.code}`);
  }

  async function inviteFriends() {
    if (!room) return;
    try {
      const result = await api.post(`/games/room/${room.code}/invite`);
      const info = result.data.data as { link: string; code: string; sent: number };
      setInviteInfo(info);
      if (info.sent === 0) toast.info('Ссылка готова — отправь её другу');
      else toast.success(`Приглашение отправлено ${info.sent} друзьям`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  if (!connected) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Spinner />
        <p className="text-sm text-muted">Подключаем игровой сервер…</p>
      </div>
    );
  }

  if (finished) {
    return <FinishedView config={config} finished={finished} onAgain={() => {
      setFinished(null);
      setRoom(null);
    }} onExit={() => navigate('/games')} />;
  }

  if (!room) {
    return (
      <div className="px-4 pb-6 pt-3">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/games')}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
            aria-label="Назад"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[10px] font-semibold text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {connected ? 'connected' : 'offline'}
          </span>
        </div>
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 p-5" style={{ background: gameMeta?.gradient ?? 'linear-gradient(135deg,#7c3aed,#0891b2)' }}>
          <div className="pointer-events-none absolute -right-8 -top-8 text-[110px] opacity-[0.13]">{config.icon}</div>
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
              <Sparkles size={12} /> онлайн-игра · {config.min}–{config.max} игроков
            </div>
            <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight text-white">{config.title}</h1>
            <p className="mt-1 text-sm text-white/65">{config.subtitle}</p>
            <p className="mt-3 max-w-md text-[12px] leading-relaxed text-white/70">{config.rules}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-[11px] font-semibold text-muted">Соперники</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                <Users size={17} />
              </span>
              <div>
                <p className="text-[11px] font-bold text-primary">Только реальные</p>
                <p className="text-[9px] text-muted">{config.min}–{config.max} игроков</p>
              </div>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-muted/70">Ботов нет. Игра начнётся, когда присоединится нужное число людей.</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-semibold text-muted">Формат</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                <Timer size={17} />
              </span>
              <div>
                <p className="text-[11px] font-bold text-primary">
                  {slug === 'word-bomb' ? '3 жизни' : slug === 'bluff-trivia' ? '5 раундов' : slug === 'converge' ? '10 раундов' : slug === 'auction' ? '5 раундов' : '16 карточек'}
                </p>
                <p className="text-[9px] text-muted">Серверный таймер</p>
              </div>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-muted/70">Все ответы, очки и таймеры считает сервер.</p>
          </Card>
        </div>

        <div className="mt-3 grid gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-violet-300">
              <Play size={13} /> Создать комнату
            </div>
            <p className="mt-1 text-[11px] text-muted">Собери друзей по коду. Игра начнётся, когда все зайдут.</p>
            <button
              type="button"
              onClick={() => setIsPrivate((value) => !value)}
              className="mt-3 flex w-full items-center justify-between rounded-2xl border border-line bg-surface/60 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-muted">
                  {isPrivate ? <Lock size={15} /> : <Radio size={15} />}
                </span>
                <span>
                  <span className="block text-xs font-semibold text-primary">
                    {isPrivate ? 'Приватная комната' : 'Публичная комната'}
                  </span>
                  <span className="text-[10px] text-muted">
                    {isPrivate ? 'Только по коду или приглашению' : 'Видна всем в списке комнат'}
                  </span>
                </span>
              </span>
              <span
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full border transition',
                  !isPrivate ? 'border-violet-400/40 bg-violet-500' : 'border-line bg-white/10',
                )}
              >
                <span
                  className={cn(
                    'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all',
                    isPrivate ? 'left-[2px]' : 'left-[22px]',
                  )}
                />
              </span>
            </button>
            <Button className="mt-3" fullWidth loading={busy === 'create'} onClick={() => void createRoom()} icon={<Users size={15} />}>
              Создать комнату
            </Button>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
              <KeyRound size={13} /> Войти по коду
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123"
                maxLength={6}
                className="h-10 text-center font-mono text-sm font-bold uppercase tracking-[0.2em]"
              />
              <Button className="shrink-0" loading={busy === 'join'} onClick={() => void join(joinCode)}>
                Войти
              </Button>
            </div>
          </Card>
        </div>

        {openRooms && openRooms.length > 0 && (
          <Card className="mt-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                <Users size={13} /> Открытые лобби
              </div>
              <span className="text-[9px] text-muted">{openRooms.length}</span>
            </div>
            <div className="mt-2 space-y-2">
              {openRooms.map((open) => (
                <div key={open.id} className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold">{open.host.firstName}</p>
                    <p className="text-[9px] text-muted">
                      {open.participants.length}/{open.maxPlayers} игроков · {open.code}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" loading={busy === 'join'} onClick={() => void join(open.code)}>
                    Войти
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (room.phase === 'lobby') {
    const isHost = room.hostId === me?.id;
    const canStart = isHost && room.members.length >= config.min;
    return (
      <div className="px-4 pb-6 pt-3">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void leave()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
            aria-label="Выйти"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[10px] font-semibold text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            connected
          </span>
        </div>

        <div className="text-center">
          <span className="text-4xl">🏟️</span>
          <h1 className="mt-3 font-display text-2xl font-semibold">Лобби готово</h1>
          <p className="mt-1 text-xs text-muted">Делитесь кодом и начинайте, когда все соберутся</p>
        </div>

        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Код комнаты</span>
            <Badge tone={room.isPrivate ? 'neutral' : 'emerald'}>
              {room.isPrivate ? '🔒 закрытая' : '🌐 открытая'}
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 rounded-2xl border border-line bg-black/25 px-3 py-3 text-center font-mono text-2xl font-black tracking-[0.3em] text-primary">
              {room.code}
            </div>
            <Button
              variant="glass"
              size="md"
              onClick={() => void copyInvite()}
              icon={inviteCopied ? <Check size={16} /> : <Copy size={16} />}
            >
              Copy
            </Button>
          </div>
        </Card>

        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Игроки · {room.members.length}/{config.max}
            </p>
            {room.members.length >= config.min && (
              <span className="text-[10px] text-emerald-300">можно начинать</span>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {room.members.map((member) => (
              <div key={member.participantId} className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] p-2.5">
                <AvatarDot member={member} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{member.name}{member.userId === me?.id ? ' · вы' : ''}</p>
                  <p className="text-[9px] text-muted">{member.connected === false ? 'переподключается' : 'готов'}</p>
                </div>
                {room.hostId === member.userId && <Crown size={14} className="text-amber-300" />}
              </div>
            ))}
            {room.members.length < config.min && (
              <p className="rounded-xl border border-dashed border-line p-3 text-center text-[10px] text-muted">
                Нужно ещё {config.min - room.members.length} игрок(а). Отправь код другу.
              </p>
            )}
          </div>
        </Card>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => void inviteFriends()} icon={<UserPlus size={14} />}>
            Пригласить
          </Button>
          <Button variant="secondary" onClick={shareRoom} icon={<Share2 size={14} />}>
            Поделиться
          </Button>
        </div>
        <Button
          variant="secondary"
          className="mt-2"
          fullWidth
          onClick={() => void copyInvite()}
          icon={inviteCopied ? <Check size={14} /> : <Copy size={14} />}
        >
          {inviteCopied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
        </Button>
        <Button
          className="mt-2"
          fullWidth
          disabled={!canStart}
          loading={busy === 'start'}
          onClick={() => void start()}
          icon={<Play size={15} />}
        >
          {isHost ? 'Начать игру' : 'Ждём хоста'}
        </Button>
        <p className="mt-3 text-center text-[10px] text-muted">{config.rules}</p>
        <InviteModal info={inviteInfo} onClose={() => setInviteInfo(null)} toast={toast} />
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">
          {config.title} · {room.code}
        </p>
        <p className="truncate text-[11px] text-muted">
          {room.phase === 'playing' ? 'Раунд идёт' : room.phase === 'input' ? 'Приём ответов' : room.phase === 'voting' ? 'Голосование' : 'Результат раунда'}
        </p>
      </div>
      <button type="button" onClick={() => void leave()} className="rounded-xl border border-line p-2 text-muted" aria-label="Выйти">
        <DoorOpen size={15} />
      </button>
    </div>
  );

  const active = room.phase === 'playing' || room.phase === 'input' || room.phase === 'voting' || room.phase === 'reveal';

  return (
    <div className="flex min-h-[calc(100dvh-128px)] flex-col px-4 pb-3 pt-2">
      {header}
      <div className="mt-2">
        <PlayerChips room={room} meId={me?.id} />
      </div>
      <div className="mt-3 flex-1">
        {slug === 'word-bomb' && <BombBoard room={room} me={me} myMember={myMember} now={now} emitAck={emitAck} toast={toast} />}
        {slug === 'auction' && <AuctionBoard room={room} me={me} now={now} emitAck={emitAck} toast={toast} />}
        {slug === 'bluff-trivia' && <BluffBoard room={room} me={me} now={now} emitAck={emitAck} toast={toast} />}
        {slug === 'converge' && <ConvergeBoard room={room} me={me} now={now} emitAck={emitAck} toast={toast} />}
        {slug === 'minefield' && <MineBoard room={room} me={me} myMember={myMember} now={now} emitAck={emitAck} toast={toast} />}
      </div>
      {active && <p className="mt-2 text-center text-[9px] text-muted">Сервер ведёт таймер. Не закрывай мини-приложение во время хода.</p>}
    </div>
  );
}

function BombBoard({
  room,
  me,
  myMember,
  now,
  emitAck,
  toast,
}: {
  room: RoomState;
  me: any;
  myMember: Member | null;
  now: number;
  emitAck: <T = unknown>(event: string, payload: unknown) => Promise<T>;
  toast: { error: (message: string) => void; success: (message: string) => void; info: (message: string) => void };
}) {
  const [word, setWord] = useState('');
  const [sending, setSending] = useState(false);
  const current = room.members.find((member) => member.participantId === room.turnId);
  const myTurn = Boolean(myMember && myMember.alive !== false && myMember.participantId === room.turnId);

  async function submit() {
    if (!word.trim()) return;
    setSending(true);
    try {
      const result = await emitAck<{ accepted?: boolean; error?: string }>('bomb:submit', { word, code: room.code });
      if (result?.error) {
        toast.error(result.error);
        haptic('error');
        return;
      }
      setWord('');
      haptic('light');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center">
      <div className="mt-1 flex w-full items-center justify-between">
        <Badge tone="amber">Раунд {room.round ?? 1}</Badge>
        <Countdown endsAt={room.turnEndsAt} now={now} />
      </div>
      <div className="relative mt-5 flex w-full flex-col items-center rounded-[30px] border border-orange-400/25 bg-gradient-to-b from-orange-500/20 to-rose-950/20 px-5 py-7 text-center">
        <span className="text-4xl">💣</span>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-orange-200/70">Слог</p>
        <p className="mt-1 font-display text-[46px] font-bold leading-none tracking-[0.12em] text-white">{room.syllable}</p>
        <p className="mt-3 text-[11px] text-white/60">
          {myTurn ? 'Твой ход — назови слово' : current ? `Ход: ${current.name}` : 'Ожидание'}
        </p>
      </div>
      <div className="mt-3 w-full">
        <div className="flex gap-2">
          <Input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            placeholder="Слово с этим слогом…"
            disabled={!myTurn}
            className="h-11 text-sm"
            autoFocus
          />
          <Button className="shrink-0" loading={sending} disabled={!myTurn} onClick={() => void submit()} icon={<Check size={15} />}>
            Ход
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(room.members ?? []).map((member: Member) => (
            <div key={member.participantId} className={cn('rounded-xl border border-line bg-white/[0.03] p-2', member.alive === false && 'opacity-40')}>
              <p className="truncate text-[10px] font-bold">{member.name}</p>
              <p className="mt-0.5 text-[9px] text-muted">{'♥'.repeat(Math.max(0, member.lives ?? 0)) || 'выбыл'}</p>
            </div>
          ))}
        </div>
        {room.usedWords?.length > 0 && (
          <p className="mt-2 text-center text-[9px] text-muted">Уже было: {room.usedWords.slice(-4).join(' · ')}</p>
        )}
      </div>
    </div>
  );
}

function AuctionBoard({
  room,
  me,
  now,
  emitAck,
  toast,
}: {
  room: RoomState;
  me: any;
  now: number;
  emitAck: <T = unknown>(event: string, payload: unknown) => Promise<T>;
  toast: { error: (message: string) => void; success: (message: string) => void; info: (message: string) => void };
}) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => setSent(false), [room.round]);
  const already = sent;
  const myPoints = room.reveal?.rows?.find((row: any) => row.participantId === room.members.find((m: Member) => m.userId === me?.id)?.participantId);

  async function submit() {
    if (!value.trim()) return;
    setSending(true);
    try {
      const result = await emitAck<{ accepted?: boolean; error?: string }>('auction:answer', { value: Number(value), code: room.code });
      if (result?.error) toast.error(result.error);
      else {
        haptic('success');
        setSent(true);
        setValue('');
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Badge tone="amber">Раунд {room.round}/{room.totalRounds}</Badge>
        <Countdown endsAt={room.phaseEndsAt} now={now} />
      </div>
      <Card className="mt-3 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Вопрос</p>
        <p className="mt-2 text-[15px] font-semibold leading-snug text-primary">{room.question?.prompt}</p>
      </Card>
      {room.phase === 'input' ? (
        <div className="mt-3">
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              placeholder="Твоё число"
              disabled={already}
              className="h-11 text-center text-lg font-bold"
            />
            <Button className="shrink-0" loading={sending} disabled={already} onClick={() => void submit()}>
              Ответить
            </Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted">
            {already ? 'Ответ принят. Ждём остальных.' : 'Не перебей правильный ответ — иначе 0 очков.'}
          </p>
          <p className="mt-2 text-center text-[10px] text-muted">Ответили: {room.answeredCount}/{room.totalPlayers}</p>
        </div>
      ) : (
        <div className="mt-3">
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-emerald-300">Правильный ответ</p>
            <p className="font-display text-3xl font-bold text-emerald-200">{room.reveal?.correct}</p>
          </div>
          <div className="mt-2 space-y-1.5">
            {(room.reveal?.rows ?? []).map((row: any) => (
              <div key={row.participantId} className={cn('flex items-center justify-between rounded-xl border p-2.5', row.over ? 'border-rose-400/20 bg-rose-500/5' : 'border-line bg-white/[0.03]')}>
                <span className="text-[11px] font-semibold">{row.name}</span>
                <span className="flex items-center gap-2 text-[11px]">
                  <span className={cn('font-mono', row.over ? 'text-rose-300' : 'text-primary')}>{row.answer ?? '—'}</span>
                  <span className={cn('font-bold', row.points > 0 ? 'text-emerald-300' : 'text-muted')}>+{row.points}</span>
                </span>
              </div>
            ))}
          </div>
          {myPoints && <p className="mt-2 text-center text-[10px] text-muted">Твой результат: +{myPoints.points}</p>}
        </div>
      )}
    </div>
  );
}

function BluffBoard({
  room,
  me,
  now,
  emitAck,
  toast,
}: {
  room: RoomState;
  me: any;
  now: number;
  emitAck: <T = unknown>(event: string, payload: unknown) => Promise<T>;
  toast: { error: (message: string) => void; success: (message: string) => void; info: (message: string) => void };
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [voted, setVoted] = useState<string | null>(null);
  useEffect(() => {
    setVoted(null);
    setText('');
  }, [room.round]);
  const submitLabel = room.phase === 'input' ? 'Придумать' : 'Голосовать';

  async function submit() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const result = await emitAck<{ accepted?: boolean; error?: string }>('bluff:input', { text, code: room.code });
      if (result?.error) toast.error(result.error);
      else {
        haptic('success');
        setText('');
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function vote(optionId: string) {
    setSending(true);
    try {
      const result = await emitAck<{ accepted?: boolean; error?: string }>('bluff:vote', { optionId, code: room.code });
      if (result?.error) toast.error(result.error);
      else {
        setVoted(optionId);
        haptic('selection');
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Badge tone="violet">Раунд {room.round}/{room.totalRounds}</Badge>
        <Countdown endsAt={room.phaseEndsAt} now={now} />
      </div>
      <Card className="mt-2 p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Факт</p>
        <p className="mt-1.5 text-[14px] font-semibold leading-snug">{room.prompt}</p>
      </Card>

      {room.phase === 'input' && (
        <div className="mt-2.5">
          <p className="text-[10px] text-muted">Придумай правдоподобный ответ. Настоящий вводить нельзя.</p>
          <div className="mt-2 flex gap-2">
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              placeholder="Твой вариант…"
              className="h-11"
              maxLength={80}
            />
            <Button className="shrink-0" loading={sending} onClick={() => void submit()}>
              {submitLabel}
            </Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted">Ответили: {room.submittedCount}/{room.totalPlayers}</p>
        </div>
      )}

      {room.phase === 'voting' && (
        <div className="mt-2.5 space-y-2">
          <p className="text-[10px] text-muted">За какой вариант отдашь голос? За свой нельзя.</p>
          {(room.options ?? []).map((option: any) => (
            <button
              key={option.id}
              type="button"
              disabled={sending || Boolean(voted)}
              onClick={() => void vote(option.id)}
              className={cn(
                'w-full rounded-2xl border p-3 text-left text-[12px] font-semibold transition',
                voted === option.id
                  ? 'border-violet-400/50 bg-violet-500/20 text-violet-100'
                  : 'border-line bg-white/[0.03] hover:border-violet-400/30',
              )}
            >
              {option.text}
            </button>
          ))}
          <p className="text-center text-[10px] text-muted">Проголосовали: {room.votedCount}/{room.totalPlayers}</p>
        </div>
      )}

      {room.phase === 'reveal' && (
        <div className="mt-2.5 space-y-2">
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-center">
            <p className="text-[9px] uppercase tracking-wider text-emerald-300">Настоящий ответ</p>
            <p className="mt-1 text-sm font-bold text-emerald-100">{room.reveal?.correctAnswer}</p>
          </div>
          {(room.reveal?.options ?? []).map((option: any) => (
            <div key={option.id} className={cn('rounded-xl border p-2.5', option.correct ? 'border-emerald-400/30 bg-emerald-500/5' : 'border-line bg-white/[0.03]')}>
              <p className="text-[11px] font-semibold">{option.text}</p>
              <p className="mt-0.5 text-[9px] text-muted">
                {option.correct ? 'правда' : `блеф: ${option.authorName ?? 'игрок'}`}
              </p>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            {(room.reveal?.points ?? []).map((row: any) => (
              <span key={row.userId} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px]">
                {row.name}: +{row.points}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConvergeBoard({
  room,
  me,
  now,
  emitAck,
  toast,
}: {
  room: RoomState;
  me: any;
  now: number;
  emitAck: <T = unknown>(event: string, payload: unknown) => Promise<T>;
  toast: { error: (message: string) => void; success: (message: string) => void; info: (message: string) => void };
}) {
  const [word, setWord] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => setSent(false), [room.round]);
  const already = sent;

  async function submit() {
    if (!word.trim()) return;
    setSending(true);
    try {
      const result = await emitAck<{ accepted?: boolean; error?: string }>('converge:answer', { word, code: room.code });
      if (result?.error) toast.error(result.error);
      else {
        haptic('success');
        setSent(true);
        setWord('');
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const pair = room.pair ?? ['', ''];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Badge tone="sky">Раунд {room.round}/10</Badge>
        <Countdown endsAt={room.phaseEndsAt} now={now} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {pair.map((item: string, index: number) => (
          <div key={index} className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-center">
            <p className="text-[9px] uppercase tracking-wider text-cyan-300/70">{index === 0 ? 'Слово A' : 'Слово B'}</p>
            <p className="mt-1 text-lg font-bold">{item}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-2xl border border-line bg-white/[0.03] p-3 text-center">
        <p className="text-[11px] text-muted">Найди одно слово-ассоциацию между ними</p>
      </div>
      {room.phase === 'input' ? (
        <div className="mt-3">
          <div className="flex gap-2">
            <Input
              value={word}
              onChange={(event) => setWord(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              placeholder="Твоя ассоциация…"
              disabled={already}
              className="h-11"
            />
            <Button className="shrink-0" loading={sending} disabled={already} onClick={() => void submit()}>
              Готово
            </Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted">
            {already ? 'Ждём второго игрока…' : 'Слова откроются одновременно.'}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <div className={cn('rounded-2xl border p-3 text-center', room.reveal?.matched ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-amber-400/30 bg-amber-500/10')}>
            <p className="text-sm font-bold">{room.reveal?.matched ? 'Совпадение! 🎉' : 'Пока не совпали'}</p>
            <p className="mt-1 text-[10px] text-muted">{room.reveal?.matched ? 'Вы на одной волне' : 'Следующий раунд — между вашими словами'}</p>
          </div>
          {(room.reveal?.rows ?? []).map((row: any) => (
            <div key={row.userId} className="flex items-center justify-between rounded-xl border border-line bg-white/[0.03] p-2.5">
              <span className="text-[11px] font-semibold">{row.name}</span>
              <span className="text-[11px] text-muted">{row.answer ?? 'не ответил'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MineBoard({
  room,
  me,
  myMember,
  now,
  emitAck,
  toast,
}: {
  room: RoomState;
  me: any;
  myMember: Member | null;
  now: number;
  emitAck: <T = unknown>(event: string, payload: unknown) => Promise<T>;
  toast: { error: (message: string) => void; success: (message: string) => void; info: (message: string) => void };
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const current = room.members.find((member) => member.participantId === room.turnId);
  const myTurn = Boolean(myMember && myMember.alive !== false && myMember.participantId === room.turnId);

  async function pick(cardId: string) {
    if (!myTurn) return;
    setPicking(cardId);
    try {
      const result = await emitAck<{ accepted?: boolean; hitMine?: boolean; error?: string }>('mine:pick', { cardId, code: room.code });
      if (result?.error) toast.error(result.error);
      else haptic(result.hitMine ? 'error' : 'light');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPicking(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Badge tone="rose">{room.category}</Badge>
        <Countdown endsAt={room.turnEndsAt} now={now} />
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">
        {myTurn ? 'Твой ход — открой карточку' : current ? `Ход: ${current.name}` : 'Ожидание'}
      </p>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {(room.cards ?? []).map((card: any) => (
          <button
            key={card.id}
            type="button"
            disabled={!myTurn || card.revealed || picking !== null}
            onClick={() => void pick(card.id)}
            className={cn(
              'flex min-h-[66px] flex-col items-center justify-center rounded-xl border p-1 text-center text-[9px] font-semibold leading-tight transition',
              card.revealed
                ? card.isMine
                  ? 'border-rose-400/50 bg-rose-500/20 text-rose-100'
                  : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
                : 'border-line bg-white/[0.04] text-primary active:scale-95',
            )}
          >
            {card.revealed ? (
              <>
                <span className="text-lg">{card.isMine ? '💥' : '✓'}</span>
                <span className="mt-0.5 line-clamp-2">{card.label}</span>
              </>
            ) : (
              <span className="text-xl opacity-40">?</span>
            )}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-[9px] text-muted">
        Безопасных осталось: {room.safeLeft ?? '—'} · мины скрыты сервером
      </p>
    </div>
  );
}

function InviteModal({
  info,
  onClose,
  toast,
}: {
  info: { link: string; code: string; sent: number } | null;
  onClose: () => void;
  toast: { success: (message: string) => void };
}) {
  return (
    <Modal open={Boolean(info)} onClose={onClose} title="Приглашение в игру">
      <div className="space-y-4 pb-2">
        <p className="text-xs leading-relaxed text-muted">
          Приглашение отправлено друзьям в уведомления. Ссылку можно скопировать или переслать в Telegram.
        </p>
        <div className="break-all rounded-2xl border border-line bg-black/20 p-3 text-[11px] text-primary">
          {info?.link}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            icon={<Copy size={15} />}
            onClick={() => {
              void navigator.clipboard?.writeText(info?.link ?? '');
              toast.success('Ссылка скопирована');
            }}
          >
            Копировать
          </Button>
          <Button
            icon={<Share2 size={15} />}
            onClick={() => {
              if (info) shareInvite(info.link, `Присоединяйся к игре в FUNBOX. Комната ${info.code}`);
            }}
          >
            Поделиться
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FinishedView({
  config,
  finished,
  onAgain,
  onExit,
}: {
  config: Config;
  finished: FinishedState;
  onAgain: () => void;
  onExit: () => void;
}) {
  const winner = finished.leaderboard[0];
  return (
    <div className="px-4 pb-6 pt-3">
      <div className="rounded-[28px] border border-amber-400/25 bg-gradient-to-b from-amber-500/20 to-transparent p-5 text-center">
        <span className="text-4xl">🏆</span>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/70">Игра завершена</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">{winner?.name ?? 'Победитель'}</h1>
        <p className="mt-1 text-[11px] text-muted">{config.title}</p>
      </div>
      <div className="mt-3 space-y-2">
        {finished.leaderboard.map((entry) => (
          <div key={entry.participantId} className={cn('flex items-center gap-2 rounded-2xl border p-3', entry.isWinner ? 'border-amber-400/30 bg-amber-500/10' : 'border-line bg-white/[0.03]')}>
            <span className="w-5 text-center text-[11px] font-bold text-muted">{entry.place}</span>
            <AvatarDot member={entry} size={32} />
            <p className="min-w-0 flex-1 truncate text-xs font-bold">{entry.name}</p>
            <span className="text-[11px] font-bold text-amber-200">{formatNumber(entry.score)}</span>
            {entry.isWinner && <Trophy size={14} className="text-amber-300" />}
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onExit} icon={<DoorOpen size={14} />}>К играм</Button>
        <Button onClick={onAgain} icon={<Play size={14} />}>Ещё раз</Button>
      </div>
    </div>
  );
}


