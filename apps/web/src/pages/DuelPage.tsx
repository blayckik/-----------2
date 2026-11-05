import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Crown,
  DoorOpen,
  Lock,
  Play,
  Plus,
  Send,
  Share2,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { haptic, shareInvite } from '../lib/telegram';
import { cn, formatNumber, formatTimeLeft } from '../lib/utils';
import type { Character, DuelState } from '../types';
import { Avatar, Badge, Button, Card, Input, Modal, Spinner } from '../components/ui';

interface DuelRoom {
  id: string;
  code: string;
  hostId: string;
  status: string;
  maxPlayers: number;
  participants: Character[];
}

type View = 'setup' | 'lobby' | 'playing' | 'finished';

export function DuelPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get('code')?.toUpperCase() ?? '';
  const { me } = useAuth();
  const { socket, connected, emitAck } = useSocket();
  const toast = useToast();

  const [view, setView] = useState<View>('setup');
  const [room, setRoom] = useState<DuelRoom | null>(null);
  const [state, setState] = useState<DuelState | null>(null);
  const [finished, setFinished] = useState<Array<Character & { place: number; isWinner: boolean }> | null>(null);
  const [word, setWord] = useState('');
  const [remaining, setRemaining] = useState(90_000);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [joinCode, setJoinCode] = useState(codeFromUrl);
  const [showJoin, setShowJoin] = useState(false);
  const [isPrivate, setIsPrivate] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<{ link: string; code: string } | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [view]);

  useEffect(() => {
    if (!socket) return;
    const onRoom = (next: DuelRoom) => {
      setRoom(next);
      setView((current) => (current === 'setup' ? 'lobby' : current));
    };
    const onStarted = (next: DuelState) => {
      setState(next);
      setFinished(null);
      setWord('');
      setView('playing');
      haptic('success');
    };
    const onWord = (payload: {
      participantId: string;
      word: string;
      points: number;
      score: number;
      isBot: boolean;
    }) => {
      setState((current) => {
        if (!current) return current;
        return {
          ...current,
          members: current.members.map((member) =>
            member.participantId === payload.participantId
              ? {
                  ...member,
                  score: payload.score,
                  words: [
                    ...(member.words ?? []),
                    { word: payload.word, points: payload.points, at: Date.now() },
                  ],
                }
              : member,
          ),
        };
      });
    };
    const onFinished = (payload: { leaderboard: Array<Character & { place: number; isWinner: boolean }> }) => {
      setFinished(payload.leaderboard);
      setView('finished');
      haptic('success');
    };
    socket.on('duel:room', onRoom);
    socket.on('duel:started', onStarted);
    socket.on('duel:word', onWord);
    socket.on('duel:finished', onFinished);
    return () => {
      socket.off('duel:room', onRoom);
      socket.off('duel:started', onStarted);
      socket.off('duel:word', onWord);
      socket.off('duel:finished', onFinished);
    };
  }, [socket]);

  useEffect(() => {
    if (codeFromUrl && connected) {
      void joinRoom(codeFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, codeFromUrl]);

  useEffect(() => {
    if (view !== 'playing' || !state) return;
    const update = () => setRemaining(Math.max(0, new Date(state.endsAt).getTime() - Date.now()));
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [view, state?.endsAt]);

  async function createRoom(withBot: boolean) {
    if (!connected) {
      toast.error('Подключение к игровому серверу…');
      return;
    }
    setCreating(true);
    try {
      const result = await emitAck<{ room: DuelRoom }>('duel:create', { withBot, isPrivate });
      setRoom(result.room);
      setView('lobby');
      if (withBot) {
        setStarting(true);
        await emitAck('duel:start', { code: result.room.code });
      }
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
    try {
      const result = await emitAck<{ room: DuelRoom }>('duel:join', { code: code.toUpperCase() });
      setRoom(result.room);
      setView('lobby');
      setShowJoin(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function startGame() {
    if (!room) return;
    setStarting(true);
    try {
      await emitAck('duel:start', { code: room.code });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setStarting(false);
    }
  }

  async function submitWord(event?: FormEvent) {
    event?.preventDefault();
    if (!room || !word.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await emitAck<{ accepted: boolean; word: string; points: number; score: number }>('duel:submit', {
        code: room.code,
        word: word.trim(),
      });
      setWord('');
      haptic('success');
      toast.success(`«${result.word}» принято · +${result.points}`);
    } catch (error) {
      haptic('error');
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function inviteFriends() {
    if (!room) return;
    try {
      const result = await api.post(`/games/room/${room.code}/invite`);
      setInviteInfo(result.data.data);
      if (result.data.data.sent) toast.success(`Приглашение отправлено ${result.data.data.sent} друзьям`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  const isHost = room?.hostId === me?.id;
  const myMember = state?.members.find((member) => member.userId === me?.id);
  const opponent = state?.members.find((member) => member.userId !== me?.id);
  const visibleLetters = useMemo(() => state?.letters ?? [], [state?.letters]);

  function usedLetterCounts() {
    const counts: Record<string, number> = {};
    for (const word of myMember?.words ?? []) {
      for (const letter of word.word) counts[letter] = (counts[letter] ?? 0) + 1;
    }
    return counts;
  }
  const used = usedLetterCounts();

  return (
    <div className="relative min-h-[calc(100dvh-0px)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,rgba(13,148,136,.24),transparent_46%)]" />
      <div className="mx-auto w-full max-w-[680px] px-4 pb-8 pt-[calc(var(--safe-top,0px)+12px)]">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
            aria-label="Назад"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[10px] font-semibold text-muted">
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
            <motion.div key="setup" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              <div className="relative overflow-hidden rounded-[32px] border border-white/[0.1] bg-gradient-to-br from-[#062e2b] via-[#0c1d25] to-[#080d13] p-5">
                <div className="absolute -right-10 -top-14 h-52 w-52 rounded-full bg-emerald-500/20 blur-[70px]" />
                <div className="relative">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-2xl shadow-[0_16px_40px_-12px_rgba(16,185,129,.6)]">
                    🔤
                  </div>
                  <h1 className="mt-4 font-display text-[28px] font-semibold leading-tight text-white">Word Duel</h1>
                  <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-white/55">
                    16 букв, 90 секунд и словарь на 100 000 слов. Составьте больше слов, чем соперник.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">⏱ 90 секунд</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">📚 100k слов</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">⚔️ 1×1</span>
                  </div>
                </div>
              </div>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                      <Lock size={16} />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-primary">{isPrivate ? 'Приватная комната' : 'Публичная комната'}</p>
                      <p className="text-[10px] text-muted">Доступ по коду или приглашению</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPrivate((value) => !value)}
                    className={cn(
                      'relative h-6 w-11 rounded-full transition',
                      !isPrivate ? 'bg-violet-500' : 'bg-white/10',
                    )}
                  >
                    <span className={cn('absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all', isPrivate ? 'left-[2px]' : 'left-[22px]')} />
                  </button>
                </div>
              </Card>

              <Button
                fullWidth
                size="lg"
                loading={creating && starting}
                onClick={() => createRoom(true)}
                icon={<Bot size={18} />}
              >
                Матч с ботом
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" loading={creating && !starting} onClick={() => createRoom(false)} icon={<Plus size={15} />}>
                  Создать с другом
                </Button>
                <Button variant="secondary" onClick={() => setShowJoin(true)} icon={<DoorOpen size={15} />}>
                  По коду
                </Button>
              </div>
              <p className="text-center text-[10px] text-muted/60">
                Слова проверяются на сервере по словарю. Буквы нельзя использовать чаще, чем они есть на поле.
              </p>
            </motion.div>
          )}

          {view === 'lobby' && room && (
            <motion.div key="lobby" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="text-center">
                <span className="text-4xl">⚔️</span>
                <h1 className="mt-3 font-display text-2xl font-semibold">Дуэль назначена</h1>
                <p className="mt-1 text-xs text-muted">Нужен второй игрок — позовите друга</p>
              </div>
              <Card className="p-4">
                <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted">Код комнаты</p>
                <div className="mt-2 rounded-2xl border border-line bg-black/25 py-3 text-center font-mono text-2xl font-black tracking-[0.32em] text-primary">
                  {room.code}
                </div>
              </Card>
              <Card className="divide-y divide-line/60 overflow-hidden">
                {room.participants.map((participant) => (
                  <div key={participant.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar user={{ firstName: participant.name, avatarUrl: participant.avatarUrl }} size={38} online />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{participant.name}</p>
                      <p className="text-[10px] text-muted">
                        {participant.isBot ? 'AI-соперник' : participant.userId === room.hostId ? 'Хост' : 'Игрок'}
                      </p>
                    </div>
                    {participant.userId === room.hostId && <Crown size={16} className="text-amber-300" />}
                  </div>
                ))}
                {room.participants.length < 2 && (
                  <div className="flex items-center justify-center gap-2 px-4 py-5 text-xs text-muted">
                    <Spinner size={15} /> Ожидаем соперника…
                  </div>
                )}
              </Card>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={inviteFriends} icon={<UserPlus size={16} />}>Пригласить</Button>
                <Button variant="secondary" onClick={() => { setView('setup'); setRoom(null); }} icon={<X size={16} />}>Выйти</Button>
              </div>
              {isHost && (
                <Button fullWidth size="lg" onClick={startGame} loading={starting} disabled={room.participants.length < 2} icon={<Play size={17} />}>
                  Начать дуэль
                </Button>
              )}
            </motion.div>
          )}

          {view === 'playing' && state && (
            <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Дуэль</p>
                  <p className="font-display text-lg font-semibold">
                    {formatNumber(myMember?.score ?? 0)}
                    <span className="mx-1.5 text-sm text-muted">:</span>
                    <span className="text-emerald-300">{formatNumber(opponent?.score ?? 0)}</span>
                  </p>
                </div>
                <div className={cn('flex items-center gap-2 rounded-2xl border px-3 py-2', remaining < 15000 ? 'border-rose-400/30 bg-rose-500/10' : 'border-line bg-surface/60')}>
                  <Timer size={16} className={remaining < 15000 ? 'text-rose-300' : 'text-emerald-300'} />
                  <span className="font-mono text-lg font-bold">{formatTimeLeft(remaining)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-line bg-surface/60 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Avatar user={{ firstName: myMember?.name ?? me?.firstName ?? '', avatarUrl: myMember?.avatarUrl ?? me?.avatarUrl }} size={28} />
                  <div>
                    <p className="text-[10px] font-bold text-primary">Вы</p>
                    <p className="text-[9px] text-muted">{myMember?.words?.length ?? 0} слов</p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-muted">VS</span>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-primary">{opponent?.name ?? 'Соперник'}</p>
                    <p className="text-[9px] text-muted">{opponent?.words?.length ?? 0} слов</p>
                  </div>
                  <Avatar user={{ firstName: opponent?.name ?? '', avatarUrl: opponent?.avatarUrl }} size={28} />
                </div>
              </div>

              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold text-primary">Буквы на поле</p>
                  <span className="text-[10px] text-muted">нажмите, чтобы добавить</span>
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  {visibleLetters.map((letter, index) => {
                    const available = visibleLetters.filter((item) => item === letter).length;
                    const usedCount = used[letter] ?? 0;
                    const dimmed = usedCount > 0 && index < usedCount;
                    return (
                      <button
                        key={`${letter}-${index}`}
                        type="button"
                        onClick={() => setWord((value) => `${value}${letter}`)}
                        className={cn(
                          'flex aspect-square items-center justify-center rounded-xl border text-sm font-black uppercase transition active:scale-95',
                          dimmed
                            ? 'border-line/50 bg-white/[0.02] text-muted/30'
                            : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20',
                        )}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
              </Card>

              <form onSubmit={submitWord} className="flex gap-2">
                <Input
                  value={word}
                  onChange={(event) => setWord(event.target.value.toLowerCase().replace(/[^а-яё]/g, '').slice(0, 9))}
                  placeholder="Составьте слово…"
                  className="h-12 text-base font-semibold"
                  autoComplete="off"
                  autoCapitalize="none"
                />
                <Button type="submit" size="md" className="h-12 shrink-0" loading={submitting} disabled={word.length < 3}>
                  <Send size={16} />
                </Button>
              </form>

              <div className="grid grid-cols-2 gap-3">
                <Card className="max-h-[210px] overflow-y-auto p-3">
                  <p className="sticky top-0 mb-2 bg-inherit text-[10px] font-black uppercase tracking-wider text-emerald-300">Ваши слова</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(myMember?.words ?? []).map((entry, index) => (
                      <span key={`${entry.word}-${index}`} className="rounded-lg border border-emerald-400/15 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
                        {entry.word} <span className="opacity-50">+{entry.points}</span>
                      </span>
                    ))}
                    {(myMember?.words?.length ?? 0) === 0 && <p className="text-[10px] text-muted">Пока пусто. Первое слово — ваше!</p>}
                  </div>
                </Card>
                <Card className="max-h-[210px] overflow-y-auto p-3">
                  <p className="sticky top-0 mb-2 bg-inherit text-[10px] font-black uppercase tracking-wider text-rose-300">Слова соперника</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(opponent?.words ?? []).map((entry, index) => (
                      <span key={`${entry.word}-${index}`} className="rounded-lg border border-rose-400/15 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-200">
                        {entry.word} <span className="opacity-50">+{entry.points}</span>
                      </span>
                    ))}
                    {(opponent?.words?.length ?? 0) === 0 && <p className="text-[10px] text-muted">Соперник пока думает…</p>}
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {view === 'finished' && finished && (
            <motion.div key="finished" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5">
              <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#063b35] via-[#0b1e25] to-[#080d13] p-6 text-center">
                <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/20 blur-[60px]" />
                <div className="relative">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/15 bg-white/10 text-4xl backdrop-blur">
                    {finished[0]?.userId === me?.id ? '🏆' : '📚'}
                  </div>
                  <h1 className="mt-4 font-display text-2xl font-semibold text-white">
                    {finished[0]?.userId === me?.id ? 'Победа в дуэли!' : 'Дуэль завершена'}
                  </h1>
                  <p className="mt-1 text-xs text-white/55">
                    {myMember?.words?.length ?? 0} слов · {formatNumber(myMember?.score ?? 0)} очков
                  </p>
                </div>
              </div>
              <Card className="overflow-hidden">
                {finished.map((member) => (
                  <div key={member.participantId} className={cn('flex items-center gap-3 px-4 py-3', member.userId === me?.id && 'bg-emerald-500/10')}>
                    <span className="w-5 text-center text-xs font-bold text-muted">{member.place === 1 ? '🥇' : '🥈'}</span>
                    <Avatar user={{ firstName: member.name, avatarUrl: member.avatarUrl }} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{member.name}</p>
                      <p className="text-[10px] text-muted">{member.words?.length ?? 0} слов</p>
                    </div>
                    <span className="font-mono text-sm font-bold">{formatNumber(member.score)}</span>
                  </div>
                ))}
              </Card>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => { setFinished(null); setState(null); setRoom(null); setView('setup'); }} icon={<Swords size={15} />}>Ещё дуэль</Button>
                <Button onClick={() => navigate('/games')} icon={<Trophy size={15} />}>К играм</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Войти в дуэль">
        <div className="space-y-4 pb-2">
          <Input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="DUEL7X"
            className="text-center font-mono text-xl font-black tracking-[0.3em]"
            maxLength={6}
          />
          <Button fullWidth onClick={() => joinRoom(joinCode)}>Присоединиться</Button>
        </div>
      </Modal>

      <Modal open={Boolean(inviteInfo)} onClose={() => setInviteInfo(null)} title="Приглашение">
        <div className="space-y-4 pb-2">
          <div className="rounded-2xl border border-line bg-black/20 p-3 text-[11px] break-all">{inviteInfo?.link}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(inviteInfo?.link ?? ''); toast.success('Ссылка скопирована'); }} icon={<Copy size={15} />}>Копировать</Button>
            <Button onClick={() => inviteInfo && shareInvite(inviteInfo.link, 'Дуэль в FUNBOX — принимаешь вызов?')} icon={<Share2 size={15} />}>Поделиться</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
