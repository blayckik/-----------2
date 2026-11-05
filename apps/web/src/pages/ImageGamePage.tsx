import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  Heart,
  Image as ImageIcon,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { api, assetUrl, getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import { cn, formatNumber } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, PageSkeleton, Spinner } from '../components/ui';

interface Round {
  id: string;
  mediaUrl: string | null;
  prompt: string;
  category?: { id: string; name: string; slug: string; icon: string | null } | null;
  difficulty: string;
  hint: string;
  hintsCount: number;
  attempts: number;
  attemptsLeft: number;
}

interface GuessResult {
  correct: boolean;
  attemptsLeft: number;
  attempts: number;
  nextHint: string | null;
  answer: string | null;
  reward: { xp: number; coins: number } | null;
  alreadySolved?: boolean;
  message?: string;
}

interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  questions: number;
}

export function ImageGamePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const [nonce, setNonce] = useState(0);
  const [category, setCategory] = useState('');
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState<GuessResult | null>(null);
  const [history, setHistory] = useState<Array<{ guess: string; correct: boolean }>>([]);
  const [imageLoaded, setImageLoaded] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['categories', 'image'],
    queryFn: async () => (await api.get('/games/categories?game=guess-image')).data.data as Category[],
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['image-round', category, nonce],
    queryFn: async () =>
      (await api.get(`/games/image/round${category ? `?category=${category}` : ''}`)).data.data as {
        round: Round | null;
        reset?: boolean;
      },
  });

  useEffect(() => {
    if (data?.reset) {
      setNonce((value) => value + 1);
    }
  }, [data?.reset]);

  useEffect(() => {
    setResult(null);
    setGuess('');
    setHistory([]);
    setImageLoaded(false);
  }, [data?.round?.id]);

  const submit = useMutation({
    mutationFn: async (value: string) => {
      if (!data?.round) throw new Error('Раунд не найден');
      const response = await api.post(`/games/image/${data.round.id}/guess`, { guess: value });
      return response.data.data as GuessResult;
    },
    onSuccess: (payload) => {
      setResult(payload);
      setHistory((items) => [...items, { guess, correct: payload.correct }]);
      setGuess('');
      if (payload.correct) {
        haptic('success');
        toast.success(`Верно! +${payload.reward?.xp} XP, +${payload.reward?.coins} FUN`);
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['image-round'] });
      } else {
        haptic('error');
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const round = data?.round;
  const solved = Boolean(result?.correct);
  const exhausted = Boolean(result && !result.correct && result.attemptsLeft === 0);

  function nextRound() {
    setNonce((value) => value + 1);
    setResult(null);
    setGuess('');
    setHistory([]);
    setImageLoaded(false);
  }

  if (isLoading) {
    return (
      <div className="px-4 pt-3">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 pt-[calc(var(--safe-top,0px)+14px)]">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
        >
          <ArrowLeft size={18} />
        </button>
        <Badge tone="amber">Guess the Image</Badge>
        <button
          type="button"
          onClick={nextRound}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-muted"
          aria-label="Следующее изображение"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-gradient-to-br from-[#3a2207] via-[#25131b] to-[#0d0912] p-5">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-amber-500/20 blur-[60px]" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/70">
              <ImageIcon size={13} /> Photo mystery
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold text-white">Что на фото?</h1>
            <p className="mt-1 text-[11px] text-white/55">Три попытки. Подсказки откроются после ошибок.</p>
          </div>
          <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-black/20 px-3 py-2 backdrop-blur">
            <Trophy size={17} className="text-amber-300" />
            <span className="mt-1 text-sm font-bold text-white">{me?.stats?.imagesGuessed ?? 0}</span>
            <span className="text-[8px] uppercase tracking-wide text-white/45">угадано</span>
          </div>
        </div>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition',
            !category ? 'border-amber-400/40 bg-amber-500/15 text-amber-200' : 'border-line bg-surface/60 text-muted',
          )}
        >
          🎲 Все
        </button>
        {categories?.filter((item) => item.questions > 0).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCategory(item.slug)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition',
              category === item.slug
                ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                : 'border-line bg-surface/60 text-muted',
            )}
          >
            {item.icon} {item.name}
          </button>
        ))}
      </div>

      {!round ? (
        <Card className="p-2">
          <EmptyState
            icon="🖼️"
            title="Все фото угаданы"
            text="Вы прошли всю коллекцию. Скоро добавим новые изображения — загляните позже."
            action={<Button onClick={() => void refetch()} icon={<RefreshCw size={15} />}>Обновить</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/40">
              {round.mediaUrl && (
                <img
                  src={assetUrl(round.mediaUrl) ?? ''}
                  alt="Загадочное изображение"
                  className={cn(
                    'h-full w-full object-cover transition duration-700',
                    imageLoaded ? 'scale-100 opacity-100' : 'scale-105 opacity-0',
                    solved && 'scale-100',
                  )}
                  onLoad={() => setImageLoaded(true)}
                  draggable={false}
                />
              )}
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner size={24} />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
              <div className="absolute left-3 top-3 flex gap-2">
                {round.category && (
                  <span className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[9px] font-semibold text-white backdrop-blur">
                    {round.category.icon} {round.category.name}
                  </span>
                )}
                <span className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[9px] font-semibold uppercase text-white/75 backdrop-blur">
                  {round.difficulty === 'HARD' ? 'hard' : round.difficulty === 'EASY' ? 'easy' : 'medium'}
                </span>
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">{round.prompt}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-white/75">
                    <Eye size={11} /> Внимание к деталям
                  </p>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map((index) => {
                    const used = result ? result.attempts > index : round.attempts > index;
                    return (
                      <Heart
                        key={index}
                        size={15}
                        className={used ? 'fill-rose-500/20 text-rose-400/40' : 'fill-rose-500 text-rose-400'}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <AnimatePresence mode="wait">
            {solved || exhausted ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  'rounded-3xl border p-5 text-center',
                  solved ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-amber-400/25 bg-amber-500/10',
                )}
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl">
                  {solved ? '🎯' : '🔍'}
                </div>
                <h3 className="mt-3 font-display text-lg font-semibold">
                  {solved ? 'Верно!' : 'Попытки закончились'}
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Правильный ответ: <span className="font-bold text-primary">{result?.answer}</span>
                </p>
                {solved && result?.reward && (
                  <div className="mt-3 inline-flex items-center gap-3 rounded-xl bg-black/20 px-4 py-2 text-[11px] font-bold">
                    <span className="text-violet-300">+{result.reward.xp} XP</span>
                    <span className="h-3 w-px bg-white/15" />
                    <span className="text-amber-300">+{result.reward.coins} FUN</span>
                  </div>
                )}
                <Button className="mt-4" fullWidth onClick={nextRound} icon={<ChevronRight size={15} />}>
                  Следующее изображение
                </Button>
              </motion.div>
            ) : (
              <motion.div key="guessing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (guess.trim().length >= 2) submit.mutate(guess.trim());
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={guess}
                    onChange={(event) => setGuess(event.target.value)}
                    placeholder="Ваш вариант ответа…"
                    className="h-12"
                    maxLength={120}
                    autoComplete="off"
                  />
                  <Button type="submit" className="h-12 shrink-0" loading={submit.isPending} disabled={guess.trim().length < 2}>
                    Ответить
                  </Button>
                </form>

                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/15 bg-amber-500/[0.07] p-3">
                  <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300/80">Подсказка</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      {result?.nextHint ?? round.hint}
                    </p>
                  </div>
                </div>

                {history.length > 0 && (
                  <div className="space-y-1.5">
                    {history.map((entry, index) => (
                      <div key={`${entry.guess}-${index}`} className="flex items-center gap-2 text-[10px] text-muted">
                        {entry.correct ? <Check size={12} className="text-emerald-400" /> : <X size={12} className="text-rose-400" />}
                        <span className="line-through">{entry.guess}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-muted">
                  <span className="flex items-center gap-1">
                    <Sparkles size={11} /> Осталось попыток: {result?.attemptsLeft ?? round.attemptsLeft}
                  </span>
                  <span>За верный ответ: +30 XP · +12 FUN</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
