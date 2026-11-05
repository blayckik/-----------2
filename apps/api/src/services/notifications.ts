import type { NotificationType, Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function settingFor(type: NotificationType): string {
  switch (type) {
    case 'FRIEND_REQUEST':
    case 'FRIEND_ACCEPTED':
      return 'notifyFriends';
    case 'MESSAGE':
      return 'notifyMessages';
    case 'ACHIEVEMENT':
      return 'notifyAchievements';
    case 'DAILY':
      return 'notifyDaily';
    case 'GAME_INVITE':
      return 'notifyGameInvites';
    default:
      return '';
  }
}

export async function sendTelegramMessage(
  telegramId: string,
  text: string,
  button?: { label: string; url: string },
  webAppButton = true,
) {
  if (!env.BOT_TOKEN) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: button
          ? {
              inline_keyboard: [
                [
                  webAppButton
                    ? { text: button.label, web_app: { url: button.url } }
                    : { text: button.label, url: button.url },
                ],
              ],
            }
          : undefined,
      }),
      signal: AbortSignal.timeout(6000),
    });
    return response.ok;
  } catch (error) {
    console.warn('[telegram] notification failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function notifyUser(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  telegram?: boolean;
}) {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { telegramId: true, settings: true },
  });
  if (!user) return null;

  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data,
    },
  });

  if (params.telegram !== false && env.BOT_TOKEN) {
    const setting = settingFor(params.type);
    const allowed =
      !setting || !user.settings || Boolean(user.settings[setting as keyof typeof user.settings]);
    if (allowed) {
      const webAppUrl = env.TELEGRAM_WEBAPP_URL.startsWith('https://') ? env.TELEGRAM_WEBAPP_URL : env.APP_URL;
      const isHttps = webAppUrl.startsWith('https://');
      void sendTelegramMessage(
        user.telegramId,
        `<b>${escapeHtml(params.title)}</b>\n\n${escapeHtml(params.body)}`,
        { label: 'Открыть FUNBOX', url: webAppUrl },
        isHttps,
      );
    }
  }

  return notification;
}

export async function logActivity(
  userId: string | null,
  action: string,
  metadata?: Prisma.InputJsonValue,
  ip?: string,
) {
  try {
    await prisma.activityLog.create({
      data: { userId: userId ?? undefined, action, metadata, ip },
    });
  } catch (error) {
    console.warn('[activity] failed:', error);
  }
}
