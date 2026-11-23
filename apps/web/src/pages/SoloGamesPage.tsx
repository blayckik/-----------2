import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, RotateCcw, Sparkles, Trophy, X } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import { cn } from '../lib/utils';
import { Badge, Button, Card, Input } from '../components/ui';

interface MathQuestion {
  id: string;
  prompt: string;
}

interface MathSession {
  sessionId: string;
  endsAt: number;
  total: number;
  questions: MathQuestion[];
}

interface MathResult {
  score: number;
  correct: number;
  total: number;
  xp: number;
  coins: number;
}

export function MathSprintPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [session, setSession] = useState<MathSession | null>(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [result, setResult] = useState<MathResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!session || result) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [session, result]);

  const seconds = session ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : 60;

  useEffect(() => {
    if (!session || result || seconds > 0) return;
    void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  async function start() {
    setBusy(true);
    try {
      const data = (await api.post('/solo/math/start')).data.data as MathSession;
      setSession(data);
      setIndex(0);
      setValue('');
      setScore(0);
      setFeedback(null);
      setResult(null);
      setNow(Date.now());
      haptic('success');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!session || result) return;
    try {
      const data = (await api.post('/solo/math/finish', { sessionId: session.sessionId })).data.data as MathResult;
      setResult(data);
      haptic(data.correct >= 9 ? 'success' : 'light');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function answer() {
    const question = session?.questions[index];
    if (!session || !question || busy || !value.trim()) return;
    setBusy(true);
    try {
      const data = (
        await api.post('/solo/math/answer', {
          sessionId: session.sessionId,
          questionId: question.id,
          value: Number(value),
        })
      ).data.data as { correct: boolean; score: number };
      setFeedback(data.correct ? 'correct' : 'wrong');
      setScore(data.score);
      haptic(data.correct ? 'success' : 'error');
      window.setTimeout(() => {
        setFeedback(null);
        setValue('');
        if (index + 1 >= session.questions.length) void finish();
        else setIndex((current) => current + 1);
      }, 450);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="px-4 pb-8 pt-4">
        <button type="button" onClick={() => navigate('/games')} className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl border border-line">
          <ArrowLeft size={18} />
        </button>
        <Card className="p-6 text-center" glow>
          <span className="text-5xl">🧮</span>
          <h1 className="mt-3 font-display text-2xl font-semibold">Спринт завершён</h1>
          <p className="mt-1 text-sm text-muted">{result.correct} из {result.total} правильных</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line bg-white/[0.03] p-2">
              <p className="text-[9px] text-muted">Очки</p>
              <p className="text-lg font-bold text-cyan-300">{result.score}</p>
            </div>
            <div className="rounded-xl border border-line bg-white/[0.03] p-2">
              <p className="text-[9px] text-muted">XP</p>
              <p className="text-lg font-bold text-violet-300">+{result.xp}</p>
            </div>
            <div className="rounded-xl border border-line bg-white/[0.03] p-2">
              <p className="text-[9px] text-muted">Coins</p>
              <p className="text-lg font-bold text-amber-300">+{result.coins}</p>
            </div>
          </div>
          <Button className="mt-5" fullWidth onClick={() => void start()} loading={busy} icon={<RotateCcw size={15} />}>
            Ещё раз
          </Button>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="px-4 pb-8 pt-4">
        <button type="button" onClick={() => navigate('/games')} className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl border border-line">
          <ArrowLeft size={18} />
        </button>
        <div className="rounded-[28px] border border-white/10 p-6" style={{ background: 'linear-gradient(135deg,#0f766e,#0891b2 55%,#4f46e5)' }}>
          <span className="text-4xl">🧮</span>
          <h1 className="mt-3 font-display text-2xl font-semibold text-white">Математический спринт</h1>
          <p className="mt-1 text-sm text-white/65">12 примеров · 60 секунд · 100 очков за правильный ответ</p>
          <p className="mt-3 text-[12px] text-white/70">Считай в уме, вводи ответ и жми Enter. Сервер проверит каждый ответ и начислит награду.</p>
        </div>
        <Button className="mt-5" fullWidth size="lg" loading={busy} onClick={() => void start()} icon={<Sparkles size={17} />}>
          Начать спринт
        </Button>
      </div>
    );
  }

  const question = session.questions[index];
  return (
    <div className="flex min-h-[calc(100dvh-128px)] flex-col px-4 pb-4 pt-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => void finish()} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line" aria-label="Завершить">
          <X size={17} />
        </button>
        <div className="flex items-center gap-2">
          <Badge tone={seconds <= 10 ? 'rose' : 'sky'}>{seconds} сек</Badge>
          <Badge tone="violet">{score} очков</Badge>
        </div>
      </div>
      <div className="mt-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Пример {index + 1} / {session.total}</p>
        <div className="mt-4 rounded-[30px] border border-cyan-400/25 bg-gradient-to-b from-cyan-500/15 to-indigo-950/20 p-8">
          <p className="font-display text-[42px] font-bold leading-none text-white">{question.prompt} = ?</p>
        </div>
        <div className="mt-5 flex gap-2">
          <Input
            type="number"
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void answer();
            }}
            placeholder="Ответ"
            className={cn('h-12 text-center text-xl font-bold', feedback === 'correct' && 'border-emerald-400', feedback === 'wrong' && 'border-rose-400')}
            autoFocus
          />
          <Button className="shrink-0" loading={busy} onClick={() => void answer()} icon={<Check size={16} />}>
            Ответ
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted">{feedback === 'correct' ? 'Верно! +100' : feedback === 'wrong' ? 'Ошибка' : 'Введи число и нажми Enter'}</p>
      </div>
    </div>
  );
}

export function NumberGuessPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(8);
  const [guess, setGuess] = useState('');
  const [hint, setHint] = useState<'higher' | 'lower' | null>(null);
  const [history, setHistory] = useState<Array<{ value: number; hint: 'higher' | 'lower' }>>([]);
  const [finished, setFinished] = useState<{ won: boolean; target: number; xp: number; coins: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const data = (await api.post('/solo/number/start')).data.data as { sessionId: string; maxAttempts: number };
      setSessionId(data.sessionId);
      setMaxAttempts(data.maxAttempts);
      setAttempts(0);
      setGuess('');
      setHint(null);
      setHistory([]);
      setFinished(null);
      haptic('success');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!sessionId || !guess.trim()) return;
    setBusy(true);
    try {
      const data = (
        await api.post('/solo/number/guess', { sessionId, value: Number(guess) })
      ).data.data as {
        won: boolean;
        hint?: 'higher' | 'lower';
        attempts: number;
        maxAttempts: number;
        finished: boolean;
        target: number;
        xp: number;
        coins: number;
      };
      setAttempts(data.attempts);
      if (data.finished) {
        setFinished(data);
        haptic(data.won ? 'success' : 'error');
      } else if (data.hint) {
        setHint(data.hint);
        setHistory((current) => [{ value: Number(guess), hint: data.hint! }, ...current]);
        setGuess('');
        haptic('light');
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const remaining = useMemo(() => Math.max(0, maxAttempts - attempts), [attempts, maxAttempts]);

  if (finished) {
    return (
      <div className="px-4 pb-8 pt-4">
        <button type="button" onClick={() => navigate('/games')} className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl border border-line">
          <ArrowLeft size={18} />
        </button>
        <Card className="p-6 text-center" glow>
          <span className="text-5xl">{finished.won ? '🎉' : '🔢'}</span>
          <h1 className="mt-3 font-display text-2xl font-semibold">{finished.won ? 'Угадал!' : 'Не угадал'}</h1>
          <p className="mt-1 text-sm text-muted">Загаданное число: <span className="font-bold text-primary">{finished.target}</span></p>
          <p className="mt-2 text-[11px] text-muted">Попыток: {attempts} · +{finished.xp} XP · +{finished.coins} FUN</p>
          <Button className="mt-5" fullWidth onClick={() => void start()} loading={busy} icon={<RotateCcw size={15} />}>
            Ещё раз
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 pt-4">
      <button type="button" onClick={() => navigate('/games')} className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl border border-line">
        <ArrowLeft size={18} />
      </button>
      <div className="rounded-[28px] border border-white/10 p-6" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed 55%,#db2777)' }}>
        <span className="text-4xl">🔢</span>
        <h1 className="mt-3 font-display text-2xl font-semibold text-white">Угадай число</h1>
        <p className="mt-1 text-sm text-white/65">Сервер загадал число от 1 до 100. У тебя {maxAttempts} попыток.</p>
      </div>
      {!sessionId ? (
        <Button className="mt-5" fullWidth size="lg" loading={busy} onClick={() => void start()} icon={<Sparkles size={17} />}>
          Начать игру
        </Button>
      ) : (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Попытка {attempts + 1}/{maxAttempts}</p>
            <Badge tone={remaining <= 2 ? 'rose' : 'sky'}>{remaining} осталось</Badge>
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              placeholder="1–100"
              className="h-11 text-center text-lg font-bold"
              autoFocus
            />
            <Button className="shrink-0" loading={busy} onClick={() => void submit()}>
              Проверить
            </Button>
          </div>
          {hint && (
            <p className="mt-3 text-center text-sm font-bold text-primary">
              {hint === 'higher' ? '⬆️ Загаданное число больше' : '⬇️ Загаданное число меньше'}
            </p>
          )}
          {history.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {history.map((entry, index) => (
                <span key={`${entry.value}-${index}`} className="rounded-full border border-line bg-white/[0.03] px-2 py-1 text-[10px]">
                  {entry.value} {entry.hint === 'higher' ? '↑' : '↓'}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
