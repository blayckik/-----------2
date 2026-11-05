import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  HelpCircle,
  Plus,
  RefreshCw,
  Sparkles,
  ThumbsUp,
  Vote,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import { cn, formatNumber, plural, timeAgo } from '../lib/utils';
import type { UserCard } from '../types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageSkeleton,
  SectionHeader,
  Textarea,
} from '../components/ui';

interface WyrQuestion {
  id: string;
  prompt: string;
  options: string[];
  votes: { a: number; b: number };
  totalVotes: number;
  percentA: number;
  percentB: number;
  myChoice: number | null;
  author?: UserCard | null;
}

interface MyQuestion {
  id: string;
  options: string[];
  isApproved: boolean;
  createdAt: string;
}

export function WyrPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [creating, setCreating] = useState(false);
  const [localQuestions, setLocalQuestions] = useState<WyrQuestion[]>([]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wyr', nonce],
    queryFn: async () =>
      (await api.get('/games/wyr/questions?count=10&fresh=true')).data.data as WyrQuestion[],
  });

  const { data: mine } = useQuery({
    queryKey: ['wyr', 'mine'],
    queryFn: async () => (await api.get('/games/wyr/mine')).data.data as MyQuestion[],
  });

  useEffect(() => {
    if (data) setLocalQuestions(data);
  }, [data]);

  const current = localQuestions[index];
  const isComplete = localQuestions.length > 0 && index >= localQuestions.length;

  const vote = useMutation({
    mutationFn: async ({ id, choice }: { id: string; choice: number }) => {
      const result = await api.post(`/games/wyr/${id}/vote`, { choice });
      return { id, choice, ...result.data.data } as {
        id: string;
        choice: number;
        votes: { a: number; b: number };
        totalVotes: number;
        percentA: number;
        percentB: number;
        reward: { xp: number; coins: number };
      };
    },
    onSuccess: (result) => {
      haptic('success');
      setLocalQuestions((questions) =>
        questions.map((question) =>
          question.id === result.id
            ? {
                ...question,
                myChoice: result.choice,
                votes: result.votes,
                totalVotes: result.totalVotes,
                percentA: result.percentA,
                percentB: result.percentB,
              }
            : question,
        ),
      );
      setAnswered((value) => value + 1);
      toast.success(`Ответ принят · +${result.reward.xp} XP, +${result.reward.coins} FUN`);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  async function createQuestion() {
    if (optionA.trim().length < 3 || optionB.trim().length < 3) {
      toast.error('Оба варианта должны быть не короче 3 символов');
      return;
    }
    setCreating(true);
    try {
      await api.post('/games/wyr/questions', { optionA, optionB });
      setShowCreate(false);
      setOptionA('');
      setOptionB('');
      toast.success('Вопрос отправлен на модерацию');
      queryClient.invalidateQueries({ queryKey: ['wyr', 'mine'] });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  function nextQuestion() {
    haptic('selection');
    setIndex((value) => value + 1);
  }

  const totalAnswers = useMemo(() => localQuestions.filter((question) => question.myChoice !== null).length, [localQuestions]);

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
        <Badge tone="rose">Would You Rather</Badge>
        <button
          type="button"
          onClick={() => {
            setNonce((value) => value + 1);
            setIndex(0);
            setAnswered(0);
            void refetch();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-muted"
          aria-label="Обновить"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-gradient-to-br from-[#43112b] via-[#24102c] to-[#0c0914] p-5">
        <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-pink-500/25 blur-[60px]" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-pink-200/70">
            <HelpCircle size={13} /> Дилемма дня
          </div>
          <h1 className="mt-2 font-display text-[25px] font-semibold leading-tight text-white">
            А ты бы <span className="text-pink-300">выбрал?</span>
          </h1>
          <p className="mt-1.5 max-w-sm text-[11px] leading-relaxed text-white/55">
            Голосуй, сравнивай себя с сообществом и предлагай собственные безумные дилеммы.
          </p>
          <div className="mt-3 flex items-center gap-3 text-[10px] font-semibold text-white/60">
            <span className="flex items-center gap-1"><Vote size={11} /> {formatNumber(totalAnswers)} ответов</span>
            <span className="text-white/25">·</span>
            <span>{localQuestions.length} дилемм</span>
          </div>
        </div>
      </div>

      {localQuestions.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon="🤔"
            title="Дилеммы закончились"
            text="Вы ответили на все доступные вопросы. Создайте свою дилемму или обновите подборку."
            action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setNonce((value) => value + 1)} icon={<RefreshCw size={15} />}>
                  Обновить
                </Button>
                <Button onClick={() => setShowCreate(true)} icon={<Plus size={15} />}>Создать</Button>
              </div>
            }
          />
        </Card>
      ) : isComplete ? (
        <Card className="relative overflow-hidden p-6 text-center">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-pink-500/15 blur-[50px]" />
          <div className="relative">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/10 bg-gradient-to-br from-pink-500/20 to-fuchsia-500/10 text-4xl">
              🎉
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">Пачка пройдена!</h2>
            <p className="mt-1.5 text-xs text-muted">
              Вы ответили на {answered} {plural(answered, 'вопрос', 'вопроса', 'вопросов')}. Сравните результаты с другими или начните новую подборку.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setNonce((value) => value + 1);
                  setIndex(0);
                  setAnswered(0);
                }}
                icon={<RefreshCw size={15} />}
              >
                Ещё вопросы
              </Button>
              <Button onClick={() => setShowCreate(true)} icon={<Plus size={15} />}>Свой вопрос</Button>
            </div>
          </div>
        </Card>
      ) : (
        current && (
          <div className="space-y-4">
            <div className="flex items-center gap-1.5">
              {localQuestions.slice(0, 12).map((question, dotIndex) => (
                <span
                  key={question.id}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-all',
                    dotIndex < index
                      ? 'bg-pink-400'
                      : dotIndex === index
                        ? 'bg-gradient-to-r from-pink-400 to-violet-400'
                        : 'bg-white/10',
                  )}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: 30, rotate: 1 }}
                animate={{ opacity: 1, x: 0, rotate: 0 }}
                exit={{ opacity: 0, x: -30, rotate: -1 }}
                transition={{ type: 'spring', stiffness: 280, damping: 28 }}
              >
                <Card className="overflow-hidden">
                  <div className="border-b border-line/60 px-5 py-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                      Вопрос {index + 1} из {localQuestions.length}
                    </p>
                    <h2 className="mt-1.5 text-balance font-display text-lg font-semibold leading-snug text-primary">
                      {current.prompt}
                    </h2>
                  </div>

                  <div className="relative">
                    {current.options.slice(0, 2).map((option, optionIndex) => {
                      const selected = current.myChoice === optionIndex;
                      const percent = optionIndex === 0 ? current.percentA : current.percentB;
                      const otherSelected = current.myChoice !== null && !selected;
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={current.myChoice !== null || vote.isPending}
                          onClick={() => vote.mutate({ id: current.id, choice: optionIndex })}
                          className={cn(
                            'relative w-full overflow-hidden px-5 py-6 text-left transition',
                            optionIndex === 0
                              ? 'bg-gradient-to-r from-violet-500/10 to-transparent'
                              : 'bg-gradient-to-r from-pink-500/10 to-transparent',
                            current.myChoice !== null && 'cursor-default',
                            selected && (optionIndex === 0 ? 'bg-violet-500/20' : 'bg-pink-500/20'),
                            otherSelected && 'opacity-55',
                            optionIndex === 0 && 'border-b border-line/60',
                          )}
                        >
                          {current.myChoice !== null && (
                            <motion.span
                              initial={{ width: 0 }}
                              animate={{ width: `${percent}%` }}
                              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                              className={cn(
                                'absolute inset-y-0 left-0 opacity-20',
                                optionIndex === 0 ? 'bg-violet-400' : 'bg-pink-400',
                              )}
                            />
                          )}
                          <div className="relative flex items-center gap-3">
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[11px] font-black',
                                selected
                                  ? optionIndex === 0
                                    ? 'border-violet-300/40 bg-violet-500 text-white'
                                    : 'border-pink-300/40 bg-pink-500 text-white'
                                  : 'border-line bg-white/[0.05] text-muted',
                              )}
                            >
                              {selected ? <Check size={16} /> : optionIndex === 0 ? 'A' : 'B'}
                            </span>
                            <span className="flex-1 text-[14px] font-semibold leading-snug text-primary">{option}</span>
                            {current.myChoice !== null && (
                              <span className="font-display text-lg font-bold text-primary">{percent}%</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-app text-[9px] font-black uppercase text-muted">
                      или
                    </div>
                  </div>

                  <div className="border-t border-line/60 p-4">
                    {current.myChoice === null ? (
                      <p className="text-center text-[10px] text-muted">Выберите вариант — результат появится сразу</p>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-bold text-primary">
                            {current.totalVotes} {plural(current.totalVotes, 'голос', 'голоса', 'голосов')}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                            <ThumbsUp size={10} /> Ваш голос учтён
                          </p>
                        </div>
                        <Button size="sm" onClick={nextQuestion} icon={<ChevronRight size={14} />}>
                          Далее
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-muted transition hover:text-primary"
              >
                <Plus size={13} /> Предложить дилемму
              </button>
              <button
                type="button"
                onClick={nextQuestion}
                className="flex items-center gap-1 text-[11px] font-semibold text-muted transition hover:text-primary"
              >
                Пропустить <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )
      )}

      {mine && mine.length > 0 && (
        <section>
          <SectionHeader title="Мои дилеммы" subtitle="Статус модерации ваших вопросов" />
          <Card className="divide-y divide-line/60 overflow-hidden">
            {mine.map((question) => (
              <div key={question.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.05] text-sm">
                  {question.isApproved ? '✅' : '⏳'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-primary">
                    {question.options[0]} <span className="text-muted">или</span> {question.options[1]}
                  </p>
                  <p className="text-[9px] text-muted">
                    {question.isApproved ? 'Опубликован' : 'На модерации'} · {timeAgo(question.createdAt)}
                  </p>
                </div>
                <Badge tone={question.isApproved ? 'emerald' : 'amber'}>
                  {question.isApproved ? 'live' : 'review'}
                </Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Своя дилемма">
        <div className="space-y-3 pb-2">
          <p className="text-xs leading-relaxed text-muted">
            Придумайте два варианта, между которыми сложно выбрать. После модерации вопрос появится в игре.
          </p>
          <Input
            label="Вариант A"
            value={optionA}
            onChange={(event) => setOptionA(event.target.value)}
            placeholder="Например: уметь летать"
            maxLength={90}
          />
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted">
            <span className="h-px flex-1 bg-line" /> или <span className="h-px flex-1 bg-line" />
          </div>
          <Input
            label="Вариант B"
            value={optionB}
            onChange={(event) => setOptionB(event.target.value)}
            placeholder="Например: читать мысли"
            maxLength={90}
          />
          <Button fullWidth loading={creating} onClick={createQuestion} icon={<Sparkles size={15} />}>
            Отправить на модерацию
          </Button>
        </div>
      </Modal>
    </div>
  );
}
