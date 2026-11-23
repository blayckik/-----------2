import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import { cn } from '../lib/utils';
import { Badge, Button, Card } from '../components/ui';

type GameSlug = 'memory' | 'reaction' | 'odd-one-out';

const GAME_META: Record<GameSlug, { title: string; icon: string; subtitle: string; accent: string }> = {
  memory: { title: 'Память', icon: '🧩', subtitle: 'Найди все пары', accent: 'linear-gradient(135deg,#7c3aed,#c026d3,#db2777)' },
  reaction: { title: 'Реакция', icon: '⚡', subtitle: 'Успей нажать', accent: 'linear-gradient(135deg,#ca8a04,#ea580c,#dc2626)' },
  'odd-one-out': { title: 'Найди лишнее', icon: '🔎', subtitle: 'Логика на скорость', accent: 'linear-gradient(135deg,#475569,#0f766e,#0891b2)' },
};

interface Result {
  score: number;
  xp: number;
  coins: number;
}

export function ArcadeSoloPage({ game }: { game: GameSlug }) {
  const navigate = useNavigate();
  const toast = useToast();
  const meta = GAME_META[game];
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const data = (await api.post('/solo/quick/start', { game })).data.data as { sessionId: string };
      setSessionId(data.sessionId);
      setResult(null);
      haptic('success');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function finish(score: number, details?: Record<string, unknown>) {
    if (!sessionId || result) return;
    try {
      const data = (await api.post('/solo/quick/finish', { sessionId, score, details })).data.data as Result;
      setResult(data);
      haptic(score >= 1000 ? 'success' : 'light');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  if (result) {
    return (
      <div className="px-4 pb-8 pt-4">
        <button type="button" onClick={() => navigate('/games')} className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl border border-line">
          <ArrowLeft size={18} />
        </button>
        <Card className="p-6 text-center" glow>
          <span className="text-5xl">{meta.icon}</span>
          <h1 className="mt-3 font-display text-2xl font-semibold">Игра завершена</h1>
          <p className="mt-1 text-sm text-muted">{meta.title}</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line bg-white/[0.03] p-2"><p className="text-[9px] text-muted">Очки</p><p className="text-lg font-bold text-cyan-300">{result.score}</p></div>
            <div className="rounded-xl border border-line bg-white/[0.03] p-2"><p className="text-[9px] text-muted">XP</p><p className="text-lg font-bold text-violet-300">+{result.xp}</p></div>
            <div className="rounded-xl border border-line bg-white/[0.03] p-2"><p className="text-[9px] text-muted">Coins</p><p className="text-lg font-bold text-amber-300">+{result.coins}</p></div>
          </div>
          <Button className="mt-5" fullWidth loading={busy} onClick={() => void start()} icon={<RotateCcw size={15} />}>Ещё раз</Button>
        </Card>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="px-4 pb-8 pt-4">
        <button type="button" onClick={() => navigate('/games')} className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl border border-line">
          <ArrowLeft size={18} />
        </button>
        <div className="rounded-[28px] border border-white/10 p-6" style={{ background: meta.accent }}>
          <span className="text-4xl">{meta.icon}</span>
          <h1 className="mt-3 font-display text-2xl font-semibold text-white">{meta.title}</h1>
          <p className="mt-1 text-sm text-white/65">{meta.subtitle}</p>
        </div>
        <Button className="mt-5" fullWidth size="lg" loading={busy} onClick={() => void start()}>Начать</Button>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => navigate('/games')} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line"><ArrowLeft size={18} /></button>
        <Badge tone="sky">{meta.title}</Badge>
      </div>
      {game === 'memory' && <MemoryGame onFinish={finish} />}
      {game === 'reaction' && <ReactionGame onFinish={finish} />}
      {game === 'odd-one-out' && <OddGame onFinish={finish} />}
    </div>
  );
}

function MemoryGame({ onFinish }: { onFinish: (score: number, details?: Record<string, unknown>) => void }) {
  const emojis = ['🍕', '🚀', '🌊', '🎸', '🦊', '🌙'];
  const [cards, setCards] = useState(() => [...emojis, ...emojis].sort(() => Math.random() - 0.5).map((emoji, index) => ({ id: index, emoji, open: false, done: false })));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    const timer = window.setTimeout(() => {
      setCards((current) => {
        const first = current[a];
        const second = current[b];
        if (first.emoji === second.emoji) {
          const next = current.map((card, index) => (index === a || index === b ? { ...card, done: true } : card));
          if (next.every((card) => card.done)) {
            const score = Math.max(200, 1300 - moves * 80);
            setFinished(true);
            onFinish(score, { moves: moves + 1 });
          }
          return next;
        }
        return current.map((card, index) => (index === a || index === b ? { ...card, open: false } : card));
      });
      setFlipped([]);
      setMoves((value) => value + 1);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [flipped, moves, onFinish]);

  function flip(index: number) {
    if (finished || flipped.length >= 2) return;
    const card = cards[index];
    if (card.open || card.done) return;
    setCards((current) => current.map((entry, i) => (i === index ? { ...entry, open: true } : entry)));
    haptic('selection');
    setFlipped((current) => [...current, index]);
  }

  return (
    <div>
      <p className="text-center text-[11px] text-muted">Ходов: {moves} · найди 6 пар</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {cards.map((card, index) => (
          <button
            key={card.id}
            type="button"
            onClick={() => flip(index)}
            className={cn('flex aspect-square items-center justify-center rounded-2xl border text-2xl transition', card.done ? 'border-emerald-400/30 bg-emerald-500/10 opacity-50' : card.open ? 'border-violet-400/50 bg-violet-500/20' : 'border-line bg-white/[0.04]')}
          >
            {card.open || card.done ? card.emoji : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReactionGame({ onFinish }: { onFinish: (score: number, details?: Record<string, unknown>) => void }) {
  const [phase, setPhase] = useState<'waiting' | 'ready' | 'done'>('waiting');
  const startedRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    timerRef.current = window.setTimeout(() => {
      startedRef.current = Date.now();
      setPhase('ready');
      haptic('success');
    }, 1500 + Math.random() * 2500);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  function tap() {
    if (phase !== 'ready') return;
    const elapsed = Date.now() - startedRef.current;
    setPhase('done');
    onFinish(Math.max(50, 1200 - elapsed), { elapsedMs: elapsed });
  }

  return (
    <button
      type="button"
      onClick={tap}
      className={cn('flex min-h-[55dvh] w-full flex-col items-center justify-center rounded-[32px] border text-center transition', phase === 'ready' ? 'border-emerald-400/40 bg-emerald-500/20' : 'border-line bg-white/[0.03]')}
    >
      <span className="text-6xl">{phase === 'ready' ? '⚡' : '…'}</span>
      <p className="mt-3 text-lg font-bold">{phase === 'ready' ? 'ЖМИ!' : 'Жди зелёного сигнала'}</p>
      <p className="mt-1 text-[11px] text-muted">{phase === 'ready' ? 'Чем быстрее, тем больше очков' : 'Не нажимай раньше времени'}</p>
    </button>
  );
}

const ODD_SETS: Array<{ items: string[]; odd: number }> = [
  { items: ['Яблоко', 'Банан', 'Груша', 'Морковь'], odd: 3 },
  { items: ['Меркурий', 'Венера', 'Марс', 'Луна'], odd: 3 },
  { items: ['Гитара', 'Скрипка', 'Барабан', 'Пианино'], odd: 2 },
  { items: ['Париж', 'Лондон', 'Берлин', 'Япония'], odd: 3 },
  { items: ['Кошка', 'Собака', 'Волк', 'Роза'], odd: 3 },
  { items: ['Молоко', 'Чай', 'Сок', 'Хлеб'], odd: 3 },
  { items: ['Красный', 'Синий', 'Зелёный', 'Круглый'], odd: 3 },
  { items: ['Марс', 'Юпитер', 'Сатурн', 'Солнце'], odd: 3 },
];

function OddGame({ onFinish }: { onFinish: (score: number, details?: Record<string, unknown>) => void }) {
  const sets = useMemo(() => [...ODD_SETS].sort(() => Math.random() - 0.5).slice(0, 5), []);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  function choose(choice: number) {
    if (selected !== null) return;
    const correct = choice === sets[index].odd;
    setSelected(choice);
    if (correct) setScore((value) => value + 200);
    haptic(correct ? 'success' : 'error');
    window.setTimeout(() => {
      if (index + 1 >= sets.length) onFinish(score + (correct ? 200 : 0), { correct: score / 200 + (correct ? 1 : 0) });
      else {
        setIndex((value) => value + 1);
        setSelected(null);
      }
    }, 550);
  }

  return (
    <div>
      <p className="text-center text-[11px] text-muted">Раунд {index + 1}/5 · {score} очков</p>
      <p className="mt-3 text-center text-sm font-semibold">Что здесь лишнее?</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {sets[index].items.map((item, choice) => (
          <button
            key={item}
            type="button"
            onClick={() => choose(choice)}
            className={cn('rounded-2xl border p-4 text-sm font-semibold transition', selected === null ? 'border-line bg-white/[0.03]' : choice === sets[index].odd ? 'border-emerald-400/40 bg-emerald-500/15' : selected === choice ? 'border-rose-400/40 bg-rose-500/15' : 'border-line opacity-40')}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
