import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Crown,
  DoorOpen,
  Lock,
  Play,
  Radio,
  RefreshCw,
  Share2,
  Sparkles,
  Swords,
  Trophy,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { api, assetUrl, getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { haptic, shareInvite } from '../lib/telegram';
import { cn, formatNumber, formatTimeLeft, userName } from '../lib/utils';
import type { Character, QuizQuestion, QuizRoom, UserCard } from '../types';
import { Avatar, Badge, Button, Card, Input, Modal, Progress, Spinner } from '../components/ui';

interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  questions: number;
}

interface RevealPayload {
  questionIndex: number;
  correctOption: number;
  distribution: number[];
  answered: number;
  leaderboard: Character[];
}

interface FinishedPayload {
  leaderboard: Array<Character & { place: number; isWinner: boolean }>;
  rewards: Array<{ userId: string; xp: number; coins: number; place: number }>;
}

interface LiveRoom {
  id: string;
  code: string;
  hostId: string;
  maxPlayers: number;
  isPrivate: boolean;
  host: UserCard;
  category: { name: string; icon: string | null } | null;
  participants: Array<{ id: string; userId: string }>;
}

type View = 'setup' | 'lobby' | 'playing' | 'finished';

export function QuizPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get('code')?.toUpperCase() ?? '';
  const { me } = useAuth();
  const { socket, connected, emitAck } = useSocket();
  const toast = useToast();

  const [view, setView] = useState<View>('setup');
  const [room, setRoom] = useState<QuizRoom | null>(null);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [finished, setFinished] = useState<FinishedPayload | null>(null);
  const [answered, setAnswered] = useState({ count: 0, total: 0 });
  const [starting, setStarting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ link: string; code: string } | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState(codeFromUrl);
  const [questionCount, setQuestionCount] = useState(7);
  const [categoryId, setCategoryId] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const joinedRef = useRef(false);
  const roomRef = useRef<QuizRoom | null>(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    if (!connected || view !== 'lobby' || !room || !me) return;
    if (room.hostId !== me.id || room.status !== 'WAITING') return;
    if (!room.settings?.autoStart || room.participants.length < 2 || autoStartedRef.current) return;
    autoStartedRef.current = true;
    setStarting(true);
    void emitAck('quiz:start', { code: room.code })
      .catch((error) => {
        autoStartedRef.current = false;
        toast.error(getErrorMessage(error));
      })
      .finally(() => setStarting(false));
  }, [connected, emitAck, me, room, toast, view]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [view]);

  const { data: categories } = useQuery({
    queryKey: ['categories', 'quiz'],
    queryFn: async () => (await api.get('/games/categories?game=quiz-battle')).data.data as Category[],
  });

  const { data: liveRooms, isFetching: roomsFetching, refetch: refetchRooms } = useQuery({
    queryKey: ['quiz-live-rooms'],
    queryFn: async () => (await api.get('/games/quiz/rooms')).data.data as LiveRoom[],
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!socket) return;

    const onRoom = (next: QuizRoom) => {
      setRoom(next);
      setView((current) => (current === 'setup' ? 'lobby' : current));
    };
    const onStarted = (state: QuizRoom) => {
      setRoom((current) => ({ ...(current ?? state), ...state }));
      setQuestion(null);
      setFinished(null);
      setReveal(null);
      setSelected(null);
      setView('playing');
    };
    const onQuestion = (payload: QuizQuestion) => {
      setQuestion(payload);
      setSelected(null);
      setReveal(null);
      setAnswered({ count: 0, total: roomRef.current?.participants?.length ?? 2 });
      setView('playing');
      haptic('light');
    };
    const onReveal = (payload: RevealPayload) => {
      setReveal(payload);
      if (payload.leaderboard) {
        setRoom((current) => (current ? { ...current, participants: payload.leaderboard } : current));
      }
    };
    const onAnswered = (payload: { questionIndex: number; answered: number; total: number }) => {
      setAnswered({ count: payload.answered, total: payload.total });
    };
    const onFinished = (payload: FinishedPayload) => {
      setFinished(payload);
      setView('finished');
      haptic('success');
    };
    const onDisconnect = () => {
      if (view === 'playing' || view === 'lobby') {
        toast.error('Соединение с игрой потеряно');
      }
    };

    socket.on('quiz:room', onRoom);
    socket.on('quiz:started', onStarted);
    socket.on('quiz:question', onQuestion);
    socket.on('quiz:reveal', onReveal);
    socket.on('quiz:answered', onAnswered);
    socket.on('quiz:finished', onFinished);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('quiz:room', onRoom);
      socket.off('quiz:started', onStarted);
      socket.off('quiz:question', onQuestion);
      socket.off('quiz:reveal', onReveal);
      socket.off('quiz:answered', onAnswered);
      socket.off('quiz:finished', onFinished);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket, toast]);

  useEffect(() => {
    if (!codeFromUrl || !connected || joinedRef.current) return;
    joinedRef.current = true;
    void joinRoom(codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, codeFromUrl]);

  useEffect(() => {
    if (!question) return;
    const update = () => setRemaining(Math.max(0, new Date(question.endsAt).getTime() - Date.now()));
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [question]);

  async function createRoom(options: { privateRoom: boolean }) {
    if (!connected) {
      toast.error('Подключение к игровому серверу…');
      return;
    }
    setCreating(true);
    setFinished(null);
    autoStartedRef.current = false;
    try {
      const result = await emitAck<{ room: QuizRoom }>('quiz:create', {
        categoryId: categoryId || undefined,
        isPrivate: options.privateRoom,
        questionCount,
      });
      setRoom(result.room);
      setView('lobby');
      void refetchRooms();
      if (!options.privateRoom) toast.success('Публичная комната создана — старт при подключении второго игрока');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCreating(false);
      setStarting(false);
    }
  }

  async function joinRoom(code: string) {
    if (!connected) {
      toast.error('Подключение к игровому серверу…');
      return;
    }
    setJoining(true);
    autoStartedRef.current = false;
    try {
      const result = await emitAck<{ room: QuizRoom }>('quiz:join', { code: code.toUpperCase() });
      setRoom(result.room);
      setView('lobby');
      setShowJoin(false);
      void refetchRooms();
      haptic('success');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setJoining(false);
    }
  }

  async function startGame() {
    if (!room) return;
    setStarting(true);
    try {
      await emitAck('quiz:start', { code: room.code });
    } catch (error) {
      toast.error(getErrorMessage(error));
      setStarting(false);
    }
  }

  async function answer(option: number) {
    if (!room || !question || selected !== null || reveal) return;
    setSelected(option);
    haptic('selection');
    try {
      await emitAck('quiz:answer', {
        code: room.code,
        questionIndex: question.questionIndex,
        choice: option,
      });
      haptic('light');
    } catch (error) {
      setSelected(null);
      toast.error(getErrorMessage(error));
    }
  }

  async function inviteFriends() {
    if (!room) return;
    try {
      const result = await api.post(`/games/room/${room.code}/invite`);
      const info = result.data.data as { link: string; code: string; sent: number };
      setInviteInfo(info);
      if (info.sent === 0) toast.info('Ссылка готова — отправьте её другу');
      else toast.success(`Приглашение отправлено ${info.sent} друзьям`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  const isHost = room?.hostId === me?.id;
  const myCharacter = room?.participants.find((participant) => participant.userId === me?.id);
  const sortedParticipants = useMemo(
    () => [...(room?.participants ?? [])].sort((a, b) => b.score - a.score),
    [room?.participants],
  );
  const myPlace = finished?.leaderboard.find((entry) => entry.userId === me?.id);
  const myReward = finished?.rewards.find((entry) => entry.userId === me?.id);

  function leaveToSetup() {
    if (room && connected) socket?.emit('quiz:leave', { code: room.code });
    autoStartedRef.current = false;
    setRoom(null);
    setQuestion(null);
    setReveal(null);
    setSelected(null);
    setFinished(null);
    setView('setup');
  }

  return (
    <div className="relative min-h-[calc(100dvh-0px)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,rgba(124,58,237,.28),transparent_45%)]" />
      <div className="mx-auto w-full max-w-[680px] px-4 pb-8 pt-[calc(var(--safe-top,0px)+12px)]">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (view === 'playing') {
                if (window.confirm('Покинуть матч? Текущая игра будет прервана для вас.')) {
                  leaveToSetup();
                  navigate('/games');
                }
              } else if (view === 'lobby') {
                leaveToSetup();
              } else {
                navigate(-1);
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary transition hover:bg-white/10"
            aria-label="Назад"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[10px] font-semibold text-muted backdrop-blur">
              <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-400' : 'bg-rose-400')} />
              {connected ? 'connected' : 'offline'}
            </span>
            {room && (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 font-mono text-[10px] font-bold tracking-widest text-primary">
                {room.code}
              </span>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {view === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <div className="relative overflow-hidden rounded-[32px] border border-white/[0.1] bg-gradient-to-br from-[#25124d] via-[#14102c] to-[#090812] p-5">
                <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full bg-violet-500/30 blur-[70px]" />
                <div className="relative">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl shadow-[0_16px_40px_-12px_rgba(168,85,247,.8)]">
                    ⚡
                  </div>
                  <h1 className="mt-4 font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
                    Quiz Battle
                  </h1>
                  <p className="mt-1.5 max-w-xs text-[12px] leading-relaxed text-white/55">
                    Викторина на скорость. Отвечайте быстрее соперников и забирайте бонус за точность.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">
                      ⏱ 18 сек на ответ
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">
                      ⚡ до 150 очков
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">
                      👥 реальные игроки
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-primary">Категория</p>
                  {categories && <span className="text-[10px] text-muted">{categories.length} категорий</span>}
                </div>
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                  <button
                    type="button"
                    onClick={() => setCategoryId('')}
                    className={cn(
                      'flex shrink-0 flex-col items-start gap-2 rounded-2xl border p-3 text-left transition',
                      !categoryId
                        ? 'border-violet-400/50 bg-violet-500/20 text-primary'
                        : 'border-line bg-surface/60 text-muted hover:border-white/20',
                    )}
                  >
                    <span className="text-xl">🎲</span>
                    <span className="text-[11px] font-bold">Микс</span>
                  </button>
                  {categories?.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setCategoryId(category.id)}
                      className={cn(
                        'flex w-[102px] shrink-0 flex-col items-start gap-2 rounded-2xl border p-3 text-left transition',
                        categoryId === category.id
                          ? 'border-violet-400/50 bg-violet-500/20 text-primary'
                          : 'border-line bg-surface/60 text-muted hover:border-white/20',
                      )}
                    >
                      <span className="text-xl">{category.icon ?? '🧠'}</span>
                      <span className="line-clamp-2 break-words text-[11px] font-bold leading-tight [overflow-wrap:anywhere]">{category.name}</span>
                      <span className="text-[9px] opacity-60">{category.questions} вопросов</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4">
                  <p className="text-[11px] font-semibold text-muted">Соперники</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                      <Users size={17} />
                    </span>
                    <div>
                      <p className="text-[11px] font-bold text-primary">Только реальные</p>
                      <p className="text-[9px] text-muted">2–8 игроков</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[9px] leading-relaxed text-muted/70">Ботов нет: игра начнётся, когда присоединится второй человек.</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[11px] font-semibold text-muted">Вопросов</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {[5, 7, 10].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setQuestionCount(value)}
                        className={cn(
                          'h-9 flex-1 rounded-xl border text-[11px] font-bold transition',
                          questionCount === value
                            ? 'border-violet-400/40 bg-violet-500/20 text-violet-200'
                            : 'border-line bg-white/[0.03] text-muted',
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[9px] text-muted/70">Около {Math.ceil(questionCount * 0.4)} минут</p>
                </Card>
              </div>

              <button
                type="button"
                onClick={() => setIsPrivate((value) => !value)}
                className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface/60 px-4 py-3 text-left"
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
                    'relative h-6 w-11 rounded-full border transition',
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

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-primary">Живые комнаты</p>
                    <p className="text-[10px] text-muted">Публичные лобби, куда можно зайти сейчас</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refetchRooms()}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition hover:text-primary"
                    aria-label="Обновить комнаты"
                  >
                    <RefreshCw size={14} className={roomsFetching ? 'animate-spin' : ''} />
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {!liveRooms?.length ? (
                    <div className="rounded-xl border border-dashed border-line px-3 py-4 text-center">
                      <p className="text-[11px] font-semibold text-primary">Пока никто не ждёт</p>
                      <p className="mt-1 text-[9px] leading-relaxed text-muted">Создайте публичную комнату — она появится здесь у других игроков.</p>
                    </div>
                  ) : (
                    liveRooms.slice(0, 4).map((live) => {
                      const full = live.participants.length >= live.maxPlayers;
                      return (
                        <div key={live.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.02] p-2.5">
                          <Avatar user={live.host} size={32} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-semibold text-primary">{userName(live.host)}</p>
                            <p className="text-[9px] text-muted">
                              {live.category ? `${live.category.icon ?? '🧠'} ${live.category.name}` : 'Микс'} · {live.participants.length}/{live.maxPlayers}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={full}
                            onClick={() => void joinRoom(live.code)}
                          >
                            {full ? 'Полно' : 'Войти'}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>

              <div className="space-y-2">
                <Button
                  fullWidth
                  size="lg"
                  loading={creating}
                  onClick={() => createRoom({ privateRoom: isPrivate })}
                  icon={<Zap size={18} />}
                >
                  Создать комнату
                </Button>
                <Button variant="secondary" fullWidth onClick={() => setShowJoin(true)} icon={<DoorOpen size={15} />}>
                  Войти по коду
                </Button>
                <p className="pt-1 text-center text-[10px] text-muted/60">
                  Без ботов. Отправьте код другу или зайдите в живую комнату.
                </p>
              </div>
            </motion.div>
          )}

          {view === 'lobby' && room && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <div className="text-center">
                <span className="text-4xl">🏟️</span>
                <h1 className="mt-3 font-display text-2xl font-semibold">Лобби готово</h1>
                <p className="mt-1 text-xs text-muted">Делитесь кодом и начинайте, когда все соберутся</p>
              </div>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Код комнаты</span>
                  <Badge tone={room.status === 'WAITING' ? 'emerald' : 'sky'}>
                    {room.status === 'WAITING' ? 'ожидание' : 'в игре'}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 rounded-2xl border border-line bg-black/25 px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.32em] text-primary">
                    {room.code}
                  </div>
                  <Button
                    variant="glass"
                    size="md"
                    onClick={() => {
                      void navigator.clipboard?.writeText(room.code);
                      haptic('selection');
                      toast.success('Код скопирован');
                    }}
                    icon={<Copy size={16} />}
                  >
                    Copy
                  </Button>
                </div>
              </Card>

              <div>
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs font-bold text-primary">Участники</p>
                  <span className="text-[10px] text-muted">{room.participants.length} в комнате</span>
                </div>
                <Card className="divide-y divide-line/60 overflow-hidden">
                  {room.participants.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-3 px-4 py-3">
                      <Avatar
                        user={{
                          firstName: participant.name,
                          avatarUrl: participant.avatarUrl,
                          level: 1,
                        }}
                        size={38}
                        online
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-primary">{participant.name}</p>
                        <p className="text-[10px] text-muted">
                          {participant.userId === room.hostId ? 'Хост' : 'Игрок'}
                        </p>
                      </div>
                      {participant.userId === room.hostId && <Crown size={16} className="text-amber-300" />}
                    </div>
                  ))}
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={inviteFriends} icon={<UserPlus size={16} />}>
                  Пригласить
                </Button>
                <Button variant="secondary" onClick={leaveToSetup} icon={<X size={16} />}>
                  Выйти
                </Button>
              </div>

              {isHost ? (
                <Button fullWidth size="lg" onClick={startGame} loading={starting} icon={<Play size={17} />}>
                  Начать игру
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface/60 py-4 text-xs text-muted">
                  <Spinner size={16} /> Ждём, когда хост начнёт игру
                </div>
              )}
            </motion.div>
          )}

          {view === 'playing' && question && room && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Вопрос</p>
                  <p className="font-display text-lg font-semibold">
                    {question.questionIndex + 1}
                    <span className="text-sm text-muted"> / {question.totalQuestions}</span>
                  </p>
                </div>
                <TimerRing remaining={remaining} duration={question.durationMs} paused={Boolean(reveal)} />
              </div>

              <Progress
                value={question.questionIndex + (reveal ? 1 : 0)}
                max={question.totalQuestions}
                height={4}
              />

              <motion.div
                key={question.questionIndex}
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              >
                <Card className="relative overflow-hidden p-5" glow>
                  <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-violet-500/15 blur-[50px]" />
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <Badge tone={question.difficulty === 'HARD' ? 'rose' : question.difficulty === 'EASY' ? 'emerald' : 'amber'}>
                        {question.difficulty === 'HARD' ? 'сложный' : question.difficulty === 'EASY' ? 'лёгкий' : 'средний'}
                      </Badge>
                      <span className="text-[10px] text-muted">
                        {answered.count}/{answered.total} ответили
                      </span>
                    </div>
                    <h2 className="mt-4 text-balance text-[19px] font-bold leading-snug text-primary">
                      {question.prompt}
                    </h2>
                    {question.hint && !reveal && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-violet-300/75">
                        <Sparkles size={12} /> {question.hint}
                      </p>
                    )}
                  </div>
                </Card>
              </motion.div>

              <div className="grid gap-2.5">
                {question.options.map((option, index) => {
                  const isCorrect = reveal?.correctOption === index;
                  const isWrongSelected = reveal && selected === index && !isCorrect;
                  const isSelected = selected === index;
                  return (
                    <motion.button
                      key={`${question.questionIndex}-${index}`}
                      type="button"
                      disabled={selected !== null || Boolean(reveal)}
                      onClick={() => answer(index)}
                      whileTap={{ scale: 0.985 }}
                      className={cn(
                        'group relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-all',
                        isCorrect
                          ? 'border-emerald-400/50 bg-emerald-500/15'
                          : isWrongSelected
                            ? 'border-rose-400/50 bg-rose-500/15'
                            : isSelected
                              ? 'border-violet-400/50 bg-violet-500/15'
                              : 'border-line bg-surface/60 hover:border-white/20 hover:bg-white/[0.07]',
                        Boolean(reveal) && !isCorrect && !isWrongSelected && 'opacity-45',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-[11px] font-black',
                          isCorrect
                            ? 'border-emerald-400/30 bg-emerald-500/25 text-emerald-200'
                            : isWrongSelected
                              ? 'border-rose-400/30 bg-rose-500/25 text-rose-200'
                              : isSelected
                                ? 'border-violet-400/30 bg-violet-500/25 text-violet-200'
                                : 'border-line bg-white/[0.05] text-muted',
                        )}
                      >
                        {isCorrect ? <Check size={15} /> : isWrongSelected ? <X size={15} /> : String.fromCharCode(65 + index)}
                      </span>
                      <span className="flex-1 text-[13px] font-semibold leading-snug text-primary">{option}</span>
                      {isSelected && !reveal && <Spinner size={14} />}
                    </motion.button>
                  );
                })}
              </div>

              {reveal && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'rounded-2xl border p-3 text-center text-xs font-semibold',
                    selected === reveal.correctOption
                      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-400/25 bg-amber-500/10 text-amber-300',
                  )}
                >
                  {selected === reveal.correctOption
                    ? 'Верно! +очки за скорость'
                    : selected === null
                      ? 'Время вышло. Следующий вопрос уже готов.'
                      : 'Неверно. Правильный ответ подсвечен.'}
                </motion.div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-[11px] font-bold text-primary">Табло</p>
                  <span className="text-[10px] text-muted">{formatTimeLeft(remaining)}</span>
                </div>
                <div className="space-y-1.5">
                  {sortedParticipants.slice(0, 4).map((participant, index) => (
                    <div key={participant.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-2.5 py-1.5">
                      <span className="w-4 text-center text-[10px] font-bold text-muted">{index + 1}</span>
                      <Avatar
                        user={{ firstName: participant.name, avatarUrl: participant.avatarUrl }}
                        size={24}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-primary">
                        {participant.name}
                        {participant.userId === me?.id && <span className="ml-1 text-violet-300">(вы)</span>}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-violet-300">
                        {formatNumber(participant.score)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'finished' && finished && (
            <motion.div
              key="finished"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5"
            >
              <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#2a1850] via-[#17122c] to-[#0a0914] p-6 text-center">
                <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-violet-500/25 blur-[60px]" />
                <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-[60px]" />
                <div className="relative">
                  <motion.div
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.1 }}
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/15 bg-white/10 text-4xl backdrop-blur"
                  >
                    {myPlace?.place === 1 ? '🏆' : myPlace?.place === 2 ? '🥈' : myPlace?.place === 3 ? '🥉' : '🎮'}
                  </motion.div>
                  <h1 className="mt-4 font-display text-2xl font-semibold text-white">
                    {myPlace?.place === 1 ? 'Победа!' : 'Матч завершён'}
                  </h1>
                  <p className="mt-1 text-xs text-white/55">
                    {myPlace ? `Ваше место — #${myPlace.place}` : 'Спасибо за игру!'}
                  </p>
                  {myReward && (
                    <div className="mt-4 inline-flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 px-5 py-2.5 text-xs font-bold backdrop-blur">
                      <span className="text-violet-300">+{myReward.xp} XP</span>
                      <span className="h-4 w-px bg-white/15" />
                      <span className="text-amber-300">+{myReward.coins} FUN</span>
                    </div>
                  )}
                </div>
              </div>

              <Card className="overflow-hidden">
                {finished.leaderboard.map((entry) => (
                  <div
                    key={entry.participantId}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3',
                      entry.userId === me?.id && 'bg-violet-500/10',
                      entry !== finished.leaderboard[finished.leaderboard.length - 1] && 'border-b border-line/60',
                    )}
                  >
                    <span className="w-6 text-center text-xs font-bold text-muted">
                      {entry.place === 1 ? '🥇' : entry.place === 2 ? '🥈' : entry.place === 3 ? '🥉' : entry.place}
                    </span>
                    <Avatar user={{ firstName: entry.name, avatarUrl: entry.avatarUrl }} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-primary">
                        {entry.name}
                        {entry.userId === me?.id && <span className="ml-1 text-violet-300">(вы)</span>}
                      </p>
                      <p className="text-[10px] text-muted">{entry.correct} верных</p>
                    </div>
                    <span className="font-mono text-sm font-bold text-primary">{formatNumber(entry.score)}</span>
                  </div>
                ))}
              </Card>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFinished(null);
                    setRoom(null);
                    setQuestion(null);
                    setView('setup');
                  }}
                  icon={<Swords size={15} />}
                >
                  Ещё матч
                </Button>
                <Button onClick={() => navigate('/games')} icon={<Trophy size={15} />}>
                  К играм
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Войти в комнату">
        <div className="space-y-4 pb-2">
          <p className="text-xs leading-relaxed text-muted">
            Введите 6-символьный код, который прислал друг. Регистр не важен.
          </p>
          <Input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="FUN7QX"
            className="text-center font-mono text-xl font-black tracking-[0.3em]"
            maxLength={6}
            autoFocus
          />
          <Button fullWidth loading={joining} onClick={() => joinRoom(joinCode)}>
            Присоединиться
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(inviteInfo)} onClose={() => setInviteInfo(null)} title="Приглашение">
        <div className="space-y-4 pb-2">
          <p className="text-xs leading-relaxed text-muted">
            Отправьте ссылку другу. Он откроет FUNBOX и сразу попадёт в комнату.
          </p>
          <div className="rounded-2xl border border-line bg-black/20 p-3 text-[11px] break-all text-primary">
            {inviteInfo?.link}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(inviteInfo?.link ?? '');
                toast.success('Ссылка скопирована');
              }}
              icon={<Copy size={15} />}
            >
              Копировать
            </Button>
            <Button
              onClick={() => {
                if (inviteInfo) shareInvite(inviteInfo.link, 'Присоединяйся к Quiz Battle в FUNBOX!');
              }}
              icon={<Share2 size={15} />}
            >
              Поделиться
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TimerRing({ remaining, duration, paused }: { remaining: number; duration: number; paused: boolean }) {
  const ratio = Math.max(0, Math.min(1, remaining / duration));
  const circumference = 2 * Math.PI * 21;
  const color = ratio > 0.5 ? '#a78bfa' : ratio > 0.25 ? '#fbbf24' : '#fb7185';
  return (
    <div className="relative h-14 w-14">
      <svg viewBox="0 0 50 50" className="-rotate-90">
        <circle cx="25" cy="25" r="21" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
        <circle
          cx="25"
          cy="25"
          r="21"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset .15s linear, stroke .3s' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-primary">
        {paused ? <Check size={16} /> : formatTimeLeft(remaining)}
      </span>
    </div>
  );
}
