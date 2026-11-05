import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bell,
  Gamepad2,
  House,
  Search,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { getTelegram } from '../../lib/telegram';
import { Avatar } from '../ui';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/', label: 'Главная', icon: House, end: true },
  { to: '/games', label: 'Игры', icon: Gamepad2 },
  { to: '/social', label: 'Соцсеть', icon: Users },
  { to: '/leaderboard', label: 'Рейтинг', icon: Trophy },
  { to: '/profile', label: 'Профиль', icon: UserRound },
];

const immersiveRoutes = ['/games/quiz', '/games/word-duel', '/chat/', '/admin'];
const hideHeaderRoutes = ['/chat', '/games/quiz', '/games/word-duel', '/games/wyr', '/games/image'];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { me } = useAuth();

  const immersive = immersiveRoutes.some(
    (route) => location.pathname === route || (route.endsWith('/') && location.pathname.startsWith(route)),
  );
  const hideHeader = hideHeaderRoutes.some((route) => location.pathname.startsWith(route));

  const { data: notificationData } = useQuery({
    queryKey: ['notifications', 'badge'],
    queryFn: async () => (await api.get('/notifications?page=1')).data.data as { unread: number },
    refetchInterval: 60_000,
    enabled: Boolean(me),
  });
  const unread = notificationData?.unread ?? me?._count?.notifications ?? 0;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  const isInnerPage = !['/', '/games', '/social', '/leaderboard', '/profile'].includes(location.pathname);
  const canGoBack = isInnerPage && window.history.length > 1;

  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;
    if (!isInnerPage) {
      tg.BackButton.hide();
      return;
    }
    const onBack = () => navigate(-1);
    tg.BackButton.onClick(onBack);
    tg.BackButton.show();
    return () => {
      tg.BackButton.offClick(onBack);
      tg.BackButton.hide();
    };
  }, [isInnerPage, navigate]);

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-app text-primary">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-28 -top-36 h-[420px] w-[420px] rounded-full bg-violet-600/20 blur-[110px]" />
        <div className="absolute -right-32 top-1/3 h-[380px] w-[380px] rounded-full bg-fuchsia-600/12 blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 h-[300px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:56px_56px]" />
      </div>

      {!hideHeader && (
        <header className="sticky top-0 z-40 border-b border-white/[0.04] bg-app/70 backdrop-blur-2xl">
          <div className="mx-auto flex h-[58px] w-full max-w-[680px] items-center justify-between px-4 pt-[var(--safe-top,0px)]">
            {canGoBack ? (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary transition hover:bg-white/10"
                aria-label="Назад"
              >
                <ArrowLeft size={18} />
              </button>
            ) : (
              <NavLink to="/" className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-black text-white shadow-[0_8px_24px_-8px_rgba(168,85,247,.8)]">
                  F
                </span>
                <span className="font-display text-[17px] font-bold tracking-tight">
                  FUN<span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">BOX</span>
                </span>
              </NavLink>
            )}

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => navigate('/search')}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-white/[0.06] hover:text-primary"
                aria-label="Поиск"
              >
                <Search size={19} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/notifications')}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-white/[0.06] hover:text-primary"
                aria-label="Уведомления"
              >
                <Bell size={19} />
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500 px-1 text-[9px] font-black text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {me && (
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="ml-0.5 rounded-full transition active:scale-95"
                  aria-label="Профиль"
                >
                  <Avatar user={me} size={31} />
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      <main
        className={cn(
          'mx-auto w-full max-w-[680px]',
          immersive ? 'pb-[calc(76px+var(--safe-bottom,0px))]' : 'pb-[calc(96px+var(--safe-bottom,0px))]',
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {!immersive && <BottomNav />}
    </div>
  );
}

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(10px+var(--safe-bottom,0px))] pt-2">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-app via-app/85 to-transparent" />
      <div className="relative mx-auto flex w-full max-w-[520px] items-center justify-between rounded-[26px] border border-white/[0.09] bg-[#0d0d1a]/85 px-1.5 py-1.5 shadow-[0_-8px_40px_-10px_rgba(0,0,0,.8),inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-2xl">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'group relative flex flex-1 flex-col items-center gap-1 rounded-[20px] py-2 text-[10px] font-semibold transition-colors',
                isActive ? 'text-white' : 'text-muted hover:text-primary',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="bottom-nav-active"
                    className="absolute inset-0 rounded-[20px] border border-violet-400/20 bg-gradient-to-b from-violet-500/25 to-fuchsia-500/10"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <item.icon
                  size={20}
                  strokeWidth={isActive ? 2.4 : 1.9}
                  className={cn('relative z-10 transition', isActive && 'drop-shadow-[0_0_10px_rgba(167,139,250,.6)]')}
                />
                <span className="relative z-10">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
