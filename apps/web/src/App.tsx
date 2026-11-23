import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { AppShell } from './components/layout/AppShell';
import { Button } from './components/ui';
import { useAuth } from './context/AuthContext';
import { api, BOT_USERNAME } from './lib/api';
import { HomePage } from './pages/HomePage';
import { AboutPage } from './pages/AboutPage';
import { GamesPage } from './pages/GamesPage';
import { QuizPage } from './pages/QuizPage';
import { DuelPage } from './pages/DuelPage';
import { WyrPage } from './pages/WyrPage';
import { ImageGamePage } from './pages/ImageGamePage';
import { MiniGamePage } from './pages/MiniGamePage';
import { SocialPage } from './pages/SocialPage';
import { FriendsPage } from './pages/FriendsPage';
import { ChatPage } from './pages/ChatPage';
import { ProfilePage } from './pages/ProfilePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { QuestsPage } from './pages/QuestsPage';
import { WalletPage } from './pages/WalletPage';
import { AchievementsPage } from './pages/AchievementsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SearchPage } from './pages/SearchPage';
import { AdminPage } from './pages/AdminPage';
import { NotFoundPage } from './pages/NotFoundPage';

const screenRoutes: Record<string, string> = {
  games: '/games',
  profile: '/profile',
  leaderboard: '/leaderboard',
  wallet: '/wallet',
  quests: '/quests',
  social: '/social',
  friends: '/friends',
  achievements: '/achievements',
  chat: '/chat',
  about: '/about',
};

export function App() {
  const { loading, error, retry, startParam, me } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (sessionStorage.getItem('funbox:start-routed')) return;
    const params = new URLSearchParams(location.search);
    const screen = params.get('screen');
    let target: string | null = null;
    if (startParam?.startsWith('room_')) target = `/join/${startParam.slice(5)}`;
    else if (startParam?.startsWith('ref_')) target = null;
    else if (startParam && screenRoutes[startParam]) target = screenRoutes[startParam];
    else if (screen && screenRoutes[screen]) target = screenRoutes[screen];
    if (target) {
      sessionStorage.setItem('funbox:start-routed', '1');
      navigate(target, { replace: true });
    }
  }, [startParam, location.search, navigate]);

  if (loading) return <BootScreen />;
  if (error) return <AuthError message={error} onRetry={retry} />;
  if (!me) return <BootScreen />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/quiz" element={<QuizPage />} />
        <Route path="games/word-duel" element={<DuelPage />} />
        <Route path="games/wyr" element={<WyrPage />} />
        <Route path="games/image" element={<ImageGamePage />} />
        <Route path="games/word-bomb" element={<MiniGamePage slug="word-bomb" />} />
        <Route path="games/bluff-trivia" element={<MiniGamePage slug="bluff-trivia" />} />
        <Route path="games/converge" element={<MiniGamePage slug="converge" />} />
        <Route path="games/auction" element={<MiniGamePage slug="auction" />} />
        <Route path="games/minefield" element={<MiniGamePage slug="minefield" />} />
        <Route path="social" element={<SocialPage />} />
        <Route path="friends" element={<FriendsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:id" element={<ChatPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profile/:id" element={<ProfilePage />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="quests" element={<QuestsPage />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="join/:code" element={<JoinRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}

function BootScreen() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-app">
      <div className="absolute h-72 w-72 rounded-full bg-violet-600/25 blur-[100px]" />
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="relative flex h-24 w-24 items-center justify-center rounded-[30px] bg-gradient-to-br from-violet-500 via-indigo-500 to-fuchsia-500 shadow-[0_30px_80px_-20px_rgba(139,92,246,.8)]"
      >
        <span className="font-display text-4xl font-bold text-white">F</span>
        <motion.span
          className="absolute inset-0 rounded-[30px] border border-white/30"
          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="relative mt-7 text-center"
      >
        <h1 className="font-display text-2xl font-bold tracking-tight text-primary">
          FUN<span className="text-gradient">BOX</span>
        </h1>
        <p className="mt-2 text-sm text-muted">Твоя территория развлечений</p>
      </motion.div>
      <div className="relative mt-8 flex gap-1.5">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-1.5 w-1.5 rounded-full bg-violet-400"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

function AuthError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-[26px] border border-amber-500/20 bg-amber-500/10 text-amber-300">
        <AlertTriangle size={34} />
      </div>
      <h1 className="mt-6 font-display text-xl font-semibold text-primary">Не удалось войти</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{message}</p>
      <Button className="mt-6" onClick={onRetry} icon={<RefreshCw size={16} />}>
        Попробовать снова
      </Button>
      <a
        href={`https://t.me/${BOT_USERNAME}`}
        className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-violet-300 hover:text-violet-200"
      >
        <Send size={14} /> Открыть Telegram-бота
      </a>
    </div>
  );
}

function JoinRedirect() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { data, error, isLoading } = useRoom(code);
  useEffect(() => {
    if (!data) return;
    const slug = data.game?.slug;
    const routes: Record<string, string> = {
      'word-duel': '/games/word-duel',
      'word-bomb': '/games/word-bomb',
      'bluff-trivia': '/games/bluff-trivia',
      converge: '/games/converge',
      auction: '/games/auction',
      minefield: '/games/minefield',
    };
    navigate(`${routes[slug ?? ''] ?? '/games/quiz'}?code=${data.code}`, { replace: true });
  }, [data, navigate]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      {isLoading ? (
        <>
          <div className="h-16 w-16 animate-pulse rounded-2xl bg-violet-500/20" />
          <p className="mt-4 text-sm text-muted">Ищем комнату {code}…</p>
        </>
      ) : error ? (
        <>
          <div className="text-4xl">🚪</div>
          <h2 className="mt-4 font-display text-lg font-semibold">Комната не найдена</h2>
          <p className="mt-2 text-sm text-muted">Возможно, игра уже завершилась или код неверный.</p>
          <Link to="/games" className="mt-5">
            <Button>К играм</Button>
          </Link>
        </>
      ) : null}
    </div>
  );
}

function useRoom(code?: string) {
  const [state, setState] = useState<{ data: any; error: string | null; isLoading: boolean }>({
    data: null,
    error: null,
    isLoading: true,
  });
  useEffect(() => {
    let alive = true;
    if (!code) return;
    api
      .get(`/games/room/${code.toUpperCase()}`)
      .then((response) => alive && setState({ data: response.data.data, error: null, isLoading: false }))
      .catch(() => alive && setState({ data: null, error: 'not found', isLoading: false }));
    return () => {
      alive = false;
    };
  }, [code]);
  return state;
}
