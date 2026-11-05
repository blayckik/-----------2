import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authenticate, fetchMe, getErrorMessage, getToken, setDemoTelegramId, setToken } from '../lib/api';
import { getStartParam, initTelegram } from '../lib/telegram';
import type { Me } from '../types';

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  error: string | null;
  startParam: string | null;
  refreshMe: () => Promise<Me | null>;
  setMe: (me: Me | null) => void;
  switchAccount: (telegramId: string) => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const startParam = useMemo(() => getStartParam(), []);

  const refreshMe = useCallback(async () => {
    if (!getToken()) return null;
    const user = (await fetchMe()) as Me;
    setMe(user);
    return user;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      setError(null);
      try {
        await initTelegram();
        if (getToken()) {
          try {
            const user = (await fetchMe()) as Me;
            if (!cancelled) setMe(user);
            return;
          } catch {
            setToken(null);
          }
        }
        const result = await authenticate();
        setToken(result.token);
        const user = (await fetchMe()) as Me;
        if (!cancelled) setMe(user);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setMe(null);
      setAttempt((value) => value + 1);
    };
    window.addEventListener('funbox:unauthorized', onUnauthorized);
    return () => window.removeEventListener('funbox:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    const theme = me?.settings?.theme ?? 'dark';
    const systemLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    const light = theme === 'light' || (theme === 'system' && systemLight);
    document.documentElement.classList.toggle('light', light);
    document.documentElement.classList.toggle('dark', !light);
    const accent = me?.profile?.accentColor;
    if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
      const rgb = [1, 3, 5].map((index) => parseInt(accent.slice(index, index + 2), 16));
      document.documentElement.style.setProperty('--accent-rgb', rgb.join(' '));
    }
  }, [me?.settings?.theme, me?.profile?.accentColor]);

  const switchAccount = useCallback(async (telegramId: string) => {
    setDemoTelegramId(telegramId);
    setToken(null);
    setMe(null);
    setLoading(true);
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      loading,
      error,
      startParam,
      refreshMe,
      setMe,
      switchAccount,
      retry: () => setAttempt((value) => value + 1),
    }),
    [me, loading, error, startParam, refreshMe, switchAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
