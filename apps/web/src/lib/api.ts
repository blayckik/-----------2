import axios, { AxiosError } from 'axios';
import { getTelegram, getStartParam } from './telegram';

const TOKEN_KEY = 'funbox_token';
const DEMO_KEY = 'funbox_demo_telegram_id';

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '';
export const DEMO_MODE = String(import.meta.env.VITE_DEMO_MODE ?? 'false') === 'true';
export const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string | undefined) || 'funbox_demo_bot';

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function setDemoTelegramId(id: string) {
  localStorage.setItem(DEMO_KEY, id);
}

export function getDemoTelegramId(): string {
  return localStorage.getItem(DEMO_KEY) || '900000001';
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && getToken()) {
      window.dispatchEvent(new CustomEvent('funbox:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    if (body?.error?.message) return body.error.message;
    if (error.code === 'ECONNABORTED') return 'Сервер долго не отвечает. Попробуйте ещё раз.';
    if (!error.response) return 'Нет связи с сервером. Проверьте подключение.';
    return 'Что-то пошло не так. Попробуйте ещё раз.';
  }
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
}

export async function authenticate(): Promise<{ token: string }> {
  const initData = getTelegram()?.initData;
  if (initData) {
    const { data } = await api.post('/auth/telegram', { initData, startParam: getStartParam() ?? undefined });
    return data.data;
  }

  if (!DEMO_MODE) {
    throw new Error('Откройте приложение через Telegram-бота FUNBOX');
  }

  const { data } = await api.post('/auth/dev', {
    telegramId: getDemoTelegramId(),
    startParam: getStartParam() ?? undefined,
  });
  return data.data;
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me');
  return data.data;
}

export function assetUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
  if (path.startsWith('/uploads') || path.startsWith('/images')) return `${API_BASE}${path}`;
  return path;
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data.url;
}

export function socketBaseUrl(): string {
  return API_BASE || window.location.origin;
}
