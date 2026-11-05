interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      photo_url?: string;
    };
    start_param?: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  isFullscreen?: boolean;
  viewportStableHeight?: number;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  openTelegramLink: (url: string) => void;
  openLink: (url: string) => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  CloudStorage?: {
    getItem: (key: string, cb: (err: string | null, value: string | null) => void) => void;
    setItem: (key: string, value: string, cb?: (err: string | null) => void) => void;
  };
  showAlert?: (message: string, cb?: () => void) => void;
  showConfirm?: (message: string, cb?: (confirmed: boolean) => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegram(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function isTelegramEnvironment(): boolean {
  return Boolean(getTelegram()?.initData);
}

function likelyTelegramContext(): boolean {
  return (
    window.location.hash.includes('tgWebApp') ||
    window.location.search.includes('tgWebApp') ||
    /Telegram/i.test(navigator.userAgent)
  );
}

/**
 * The official Telegram WebApp SDK is loaded only inside Telegram (where the
 * launch hash is present). This keeps the browser demo fully offline-capable
 * and avoids blocking startup on a third-party script.
 */
async function loadTelegramSdk(): Promise<void> {
  if (getTelegram() || !likelyTelegramContext()) return;
  await new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    const timeout = window.setTimeout(() => resolve(), 3500);
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    document.head.appendChild(script);
  });
}

export async function initTelegram() {
  await loadTelegramSdk();
  const tg = getTelegram();
  if (!tg) {
    document.documentElement.classList.add('browser-preview');
    return;
  }

  tg.ready();
  tg.expand();
  try {
    tg.disableVerticalSwipes?.();
  } catch {
    // Older Telegram clients.
  }

  const applyColors = () => {
    const bg = tg.themeParams.bg_color ?? '#070711';
    const secondary = tg.themeParams.secondary_bg_color ?? bg;
    tg.setHeaderColor(bg);
    tg.setBackgroundColor(bg);
    tg.setBottomBarColor?.(secondary);
    document.documentElement.style.setProperty('--tg-bg', bg);
    document.documentElement.style.setProperty('--tg-secondary-bg', secondary);
    if (tg.themeParams.button_color) {
      document.documentElement.style.setProperty('--tg-button', tg.themeParams.button_color);
    }
  };
  applyColors();

  const safeTop = tg.contentSafeAreaInset?.top ?? tg.safeAreaInset?.top ?? 0;
  const safeBottom = tg.contentSafeAreaInset?.bottom ?? tg.safeAreaInset?.bottom ?? 0;
  document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${safeBottom}px`);

  tg.BackButton.hide();
}

export function getStartParam(): string | null {
  const tg = getTelegram();
  if (tg?.initDataUnsafe?.start_param) return tg.initDataUnsafe.start_param;
  const url = new URL(window.location.href);
  return url.searchParams.get('startapp') || url.searchParams.get('tgWebAppStartParam');
}

export function haptic(type: 'light' | 'medium' | 'success' | 'error' | 'selection' = 'light') {
  const hf = getTelegram()?.HapticFeedback;
  if (!hf) return;
  try {
    if (type === 'success' || type === 'error') hf.notificationOccurred(type);
    else if (type === 'selection') hf.selectionChanged();
    else hf.impactOccurred(type);
  } catch {
    // no-op
  }
}

export function openTelegramLink(url: string) {
  const tg = getTelegram();
  if (tg) tg.openTelegramLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export function shareInvite(link: string, text: string) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  openTelegramLink(share);
}

export function showConfirm(message: string): Promise<boolean> {
  const tg = getTelegram();
  if (!tg?.showConfirm) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => tg.showConfirm!(message, resolve));
}

export function openExternal(url: string) {
  const tg = getTelegram();
  if (tg) tg.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
