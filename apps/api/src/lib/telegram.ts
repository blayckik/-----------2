import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from './http.js';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: Date;
  startParam?: string;
}

/**
 * Official Telegram Mini App initData validation.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string): ValidatedInitData {
  if (!env.BOT_TOKEN) {
    throw new HttpError(
      503,
      'Telegram-авторизация не настроена: добавьте BOT_TOKEN в окружение сервера',
      'BOT_NOT_CONFIGURED',
    );
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new HttpError(401, 'initData не содержит подпись', 'INVALID_INIT_DATA');

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  const calculated = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const providedBuffer = Buffer.from(hash, 'hex');
  const calculatedBuffer = Buffer.from(calculated, 'hex');
  if (
    providedBuffer.length !== calculatedBuffer.length ||
    !timingSafeEqual(providedBuffer, calculatedBuffer)
  ) {
    throw new HttpError(401, 'Подпись Telegram недействительна', 'INVALID_SIGNATURE');
  }

  const authDateRaw = Number(params.get('auth_date'));
  if (!Number.isFinite(authDateRaw)) {
    throw new HttpError(401, 'Некорректная дата авторизации', 'INVALID_AUTH_DATE');
  }
  const authDate = new Date(authDateRaw * 1000);
  const ageSeconds = (Date.now() - authDate.getTime()) / 1000;
  if (ageSeconds > env.TELEGRAM_INIT_TTL_SECONDS || ageSeconds < -120) {
    throw new HttpError(401, 'Сессия Telegram устарела, откройте приложение заново', 'EXPIRED_INIT_DATA');
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new HttpError(401, 'initData не содержит пользователя', 'INVALID_INIT_DATA');

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    throw new HttpError(401, 'Некорректные данные пользователя', 'INVALID_INIT_DATA');
  }

  if (!user.id || !user.first_name) {
    throw new HttpError(401, 'Некорректный профиль Telegram', 'INVALID_INIT_DATA');
  }

  return { user, authDate, startParam: params.get('start_param') || undefined };
}

export function isAdminTelegramId(telegramId: string): boolean {
  return env.adminTelegramIds.includes(telegramId);
}
