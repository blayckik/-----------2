import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import type { Context } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const BOT_SECRET = process.env.BOT_SECRET ?? '';
const WEBAPP_URL = process.env.WEBAPP_URL ?? 'http://localhost:5173';
const BOT_USERNAME = process.env.BOT_USERNAME ?? 'funbox_demo_bot';

if (!BOT_TOKEN) {
  console.log('ℹ️  BOT_TOKEN is empty — Telegram bot is not started.');
  console.log('   Add a token from @BotFather to apps/bot/.env and restart.');
  process.exit(0);
}

const bot = new Telegraf(BOT_TOKEN);

const isHttps = WEBAPP_URL.startsWith('https://');

async function api<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}/api/bot${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': BOT_SECRET,
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { data: T };
    return json.data;
  } catch (error) {
    console.error('[api]', path, error instanceof Error ? error.message : error);
    return null;
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openButton(label = '🚀 Открыть FUNBOX') {
  return isHttps
    ? Markup.button.webApp(label, WEBAPP_URL)
    : Markup.button.url(label, WEBAPP_URL);
}

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [openButton()],
    [
      Markup.button.callback('👤 Мой профиль', 'profile'),
      Markup.button.callback('🎮 Игры', 'games'),
    ],
    [
      Markup.button.callback('🏆 Рейтинг', 'rating'),
      Markup.button.callback('🎁 Ежедневная награда', 'daily'),
    ],
    [Markup.button.callback('❓ Помощь', 'help')],
  ]);
}

function backKeyboard() {
  return Markup.inlineKeyboard([[openButton()], [Markup.button.callback('← Назад', 'menu')]]);
}

function progressBar(value: number, max: number, size = 10) {
  const filled = Math.min(size, Math.max(0, Math.round((value / Math.max(1, max)) * size)));
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

function displayName(user: {
  name?: string;
  firstName?: string;
  username?: string | null;
}) {
  return user.name || user.firstName || (user.username ? `@${user.username}` : 'Игрок');
}

async function sendWelcome(ctx: Context, referral?: string) {
  const name = ctx.from?.first_name ? escapeHtml(ctx.from.first_name) : '';
  const text = [
    'Добро пожаловать в FUNBOX! 🎉',
    '',
    'Твоя территория развлечений уже здесь.',
    '',
    'Играй, соревнуйся с друзьями, выполняй задания, зарабатывай награды и становись лучшим!',
    '',
    name ? `Привет, ${name}!` : '',
    '⚡ Quiz Battle · 🔤 Word Duel · 🤔 Would You Rather · 🖼️ Guess the Image',
    referral ? '🎁 Ты пришёл по приглашению друга — бонусные FUN Coins уже ждут в приложении.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const link = referral
    ? `${WEBAPP_URL}${WEBAPP_URL.includes('?') ? '&' : '?'}startapp=${encodeURIComponent(referral)}`
    : WEBAPP_URL;

  const keyboard = Markup.inlineKeyboard([
    [
      isHttps
        ? Markup.button.webApp('🚀 Открыть FUNBOX', link)
        : Markup.button.url('🚀 Открыть FUNBOX', link),
    ],
    [
      Markup.button.callback('👤 Мой профиль', 'profile'),
      Markup.button.callback('🎮 Игры', 'games'),
    ],
    [
      Markup.button.callback('🏆 Рейтинг', 'rating'),
      Markup.button.callback('🎁 Ежедневная награда', 'daily'),
    ],
    [Markup.button.callback('❓ Помощь', 'help')],
  ]);

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
}

function appUrl(screen?: string) {
  if (!screen) return WEBAPP_URL;
  const url = new URL(WEBAPP_URL);
  url.searchParams.set('screen', screen);
  return url.toString();
}

function screenButton(label: string, screen: string) {
  return isHttps ? Markup.button.webApp(label, appUrl(screen)) : Markup.button.url(label, appUrl(screen));
}

async function sendProfile(ctx: Context) {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : '';
  const user = await api<{
    name: string;
    username: string | null;
    level: number;
    xp: number;
    levelProgress: { current: number; needed: number; percent: number };
    coins: number;
    friends: number;
    rank: number;
    stats: { gamesPlayed: number; gamesWon: number; quizWins: number };
    achievements: Array<{ achievement: { icon: string; name: string } }>;
    dailyAvailable: boolean;
  }>(`/user/${telegramId}`);

  if (!user) {
    await ctx.reply(
      'Профиль ещё не создан. Открой FUNBOX — это займёт пару секунд, и я покажу твою статистику ✨',
      { reply_markup: Markup.inlineKeyboard([[openButton()]]).reply_markup },
    );
    return;
  }

  const achievements = user.achievements.length
    ? user.achievements.map((row) => `${row.achievement.icon} ${escapeHtml(row.achievement.name)}`).join(' · ')
    : 'Пока нет — самое время начать!';

  const text = [
    `${escapeHtml(user.name)}${user.username ? ` · @${escapeHtml(user.username)}` : ''}`,
    '',
    `⭐ Уровень ${user.level}  ${progressBar(user.levelProgress.current, user.levelProgress.needed)}  ${user.levelProgress.percent}%`,
    `✨ XP: ${user.xp.toLocaleString('ru-RU')}`,
    `🪙 FUN Coins: ${user.coins.toLocaleString('ru-RU')}`,
    `👥 Друзей: ${user.friends}`,
    `🏅 Рейтинг: #${user.rank}`,
    '',
    `🎮 Игр: ${user.stats?.gamesPlayed ?? 0} · Побед: ${user.stats?.gamesWon ?? 0} · Квизов: ${user.stats?.quizWins ?? 0}`,
    '',
    `🏆 Достижения: ${achievements}`,
    '',
    user.dailyAvailable ? '🎁 Ежедневная награда доступна!' : '✅ Ежедневная награда уже получена.',
  ].join('\n');

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [screenButton('Открыть профиль', 'profile')],
      [Markup.button.callback('🎁 Забрать бонус', 'daily')],
      [Markup.button.callback('← Назад', 'menu')],
    ]).reply_markup,
  });
}

async function sendGames(ctx: Context) {
  const games = await api<Array<{ title: string; subtitle: string; icon: string; description: string }>>('/games');
  if (!games) {
    await ctx.reply('Не удалось загрузить игры. Попробуйте позже.', {
      reply_markup: Markup.inlineKeyboard([[openButton()]]).reply_markup,
    });
    return;
  }
  const text = [
    '🎮 Игры FUNBOX',
    '',
    ...games.map(
      (game) => `${game.icon} <b>${escapeHtml(game.title)}</b> — ${escapeHtml(game.subtitle)}\n${escapeHtml(game.description)}`,
    ),
    '',
    'Выбирай игру в приложении — там комнаты, друзья и живые соперники.',
  ].join('\n\n');
  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [screenButton('🎮 Открыть игры', 'games')],
      [Markup.button.callback('← Назад', 'menu')],
    ]).reply_markup,
  });
}

async function sendRating(ctx: Context) {
  const users = await api<
    Array<{ firstName: string; username: string | null; level: number; xp: number; profile?: { displayName: string } }>
  >('/leaderboard');
  if (!users) {
    await ctx.reply('Рейтинг временно недоступен.', {
      reply_markup: Markup.inlineKeyboard([[openButton()]]).reply_markup,
    });
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const lines = users.map((user, index) => {
    const medal = medals[index] ?? `${index + 1}.`;
    return `${medal} ${escapeHtml(displayName(user))}${user.username ? ` · @${escapeHtml(user.username)}` : ''} — ${user.xp.toLocaleString('ru-RU')} XP`;
  });
  await ctx.reply(['🏆 Топ игроков FUNBOX', '', ...lines, '', 'Полный рейтинг — в приложении.'].join('\n'), {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [screenButton('🏆 Открыть рейтинг', 'leaderboard')],
      [Markup.button.callback('← Назад', 'menu')],
    ]).reply_markup,
  });
}

async function sendDaily(ctx: Context) {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : '';
  const result = await api<{ claimed: boolean; day: number; xp: number; coins: number; nextInMs: number }>('/daily', {
    method: 'POST',
    body: JSON.stringify({ telegramId }),
  });

  if (!result) {
    await ctx.reply(
      'Не удалось получить награду. Если профиль ещё не создан — открой FUNBOX и вернись сюда.',
      { reply_markup: Markup.inlineKeyboard([[openButton()]]).reply_markup },
    );
    return;
  }

  if (!result.claimed) {
    await ctx.reply(
      `Сегодняшняя награда уже получена ✅\n\nДень серии: ${result.day}\nСледующая награда — через ${Math.ceil(result.nextInMs / 3_600_000)} ч.`,
      {
        reply_markup: Markup.inlineKeyboard([
          [screenButton('🎁 Открыть кошелёк', 'wallet')],
          [Markup.button.callback('← Назад', 'menu')],
        ]).reply_markup,
      },
    );
    return;
  }

  await ctx.reply(
    `🎁 Ежедневная награда · день ${result.day}\n\n+${result.xp} XP\n+${result.coins} FUN Coins\n\nЗаходите завтра, серия увеличивает награду!`,
    {
      reply_markup: Markup.inlineKeyboard([
        [screenButton('🪙 Открыть кошелёк', 'wallet')],
        [Markup.button.callback('← Назад', 'menu')],
      ]).reply_markup,
    },
  );
}

async function sendHelp(ctx: Context) {
  const text = [
    '❓ <b>Помощь FUNBOX</b>',
    '',
    '<b>Команды</b>',
    '/start — главное меню',
    '/profile — профиль и статистика',
    '/games — список игр',
    '/rating — топ игроков',
    '/daily — ежедневная награда',
    '/settings — уведомления',
    '/help — эта справка',
    '',
    '<b>Как играть</b>',
    '• Quiz Battle — викторина на скорость с ботами или друзьями.',
    '• Word Duel — составьте больше слов из 16 букв за 90 секунд.',
    '• Would You Rather — голосуйте и сравнивайте себя с другими.',
    '• Guess the Image — угадайте фото за 3 попытки.',
    '',
    'FUN Coins — виртуальная игровая валюта. Она не имеет денежной стоимости и не подлежит выводу.',
    '',
    `Поддержка: @${BOT_USERNAME.replace('_bot', '_support')}`,
  ].join('\n');
  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [openButton()],
      [Markup.button.callback('⚙️ Настройки', 'settings')],
    ]).reply_markup,
  });
}

const settingLabels: Record<string, string> = {
  notifyDaily: '🎁 Ежедневные напоминания',
  notifyMessages: '💬 Новые сообщения',
  notifyFriends: '👥 Заявки в друзья',
  notifyAchievements: '🏆 Достижения',
  notifyGameInvites: '🎮 Приглашения в игры',
};

async function sendSettings(ctx: Context) {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : '';
  const settings = await api<Record<string, boolean>>(`/settings/${telegramId}`);
  if (!settings) {
    await ctx.reply('Настройки доступны после первого открытия FUNBOX.', {
      reply_markup: Markup.inlineKeyboard([[openButton()]]).reply_markup,
    });
    return;
  }
  const rows = Object.entries(settingLabels).map(([key, label]) => [
    Markup.button.callback(`${settings[key] ? '✅' : '⬜'} ${label}`, `toggle:${key}`),
  ]);
  await ctx.reply('⚙️ <b>Уведомления FUNBOX</b>\n\nНажмите, чтобы включить или выключить.', {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([...rows, [openButton()]]).reply_markup,
  });
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload;
  await sendWelcome(ctx, payload || undefined);
});

bot.command('profile', (ctx) => sendProfile(ctx));
bot.command('games', (ctx) => sendGames(ctx));
bot.command('rating', (ctx) => sendRating(ctx));
bot.command('daily', (ctx) => sendDaily(ctx));
bot.command('help', (ctx) => sendHelp(ctx));
bot.command('settings', (ctx) => sendSettings(ctx));
bot.command('menu', (ctx) => sendWelcome(ctx));

bot.action('menu', async (ctx) => {
  await ctx.answerCbQuery();
  await sendWelcome(ctx);
});
bot.action('profile', async (ctx) => {
  await ctx.answerCbQuery();
  await sendProfile(ctx);
});
bot.action('games', async (ctx) => {
  await ctx.answerCbQuery();
  await sendGames(ctx);
});
bot.action('rating', async (ctx) => {
  await ctx.answerCbQuery();
  await sendRating(ctx);
});
bot.action('daily', async (ctx) => {
  await ctx.answerCbQuery();
  await sendDaily(ctx);
});
bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await sendHelp(ctx);
});
bot.action('settings', async (ctx) => {
  await ctx.answerCbQuery();
  await sendSettings(ctx);
});
bot.action(/^toggle:(.+)$/, async (ctx) => {
  const key = ctx.match[1];
  if (!settingLabels[key]) return ctx.answerCbQuery('Неизвестная настройка');
  const telegramId = ctx.from?.id ? String(ctx.from.id) : '';
  const settings = await api<Record<string, boolean>>(`/settings/${telegramId}`);
  if (!settings) return ctx.answerCbQuery('Сначала откройте FUNBOX');
  const next = !settings[key];
  const updated = await api<Record<string, boolean>>(`/settings/${telegramId}`, {
    method: 'POST',
    body: JSON.stringify({ [key]: next }),
  });
  await ctx.answerCbQuery(next ? 'Включено' : 'Выключено');
  if (!updated) return;
  const rows = Object.entries(settingLabels).map(([settingKey, label]) => [
    Markup.button.callback(`${updated[settingKey] ? '✅' : '⬜'} ${label}`, `toggle:${settingKey}`),
  ]);
  await ctx.editMessageReplyMarkup(
    Markup.inlineKeyboard([...rows, [openButton()]]).reply_markup,
  );
});

bot.catch((error, ctx) => {
  console.error('[bot]', ctx.updateType, error instanceof Error ? error.message : error);
});

let lastReminderDate = '';
async function dailyReminders() {
  const now = new Date();
  const moscowHour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(now),
  );
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now);
  if (moscowHour < 18 || lastReminderDate === dateKey) return;
  lastReminderDate = dateKey;
  const users = await api<Array<{ telegramId: string; firstName: string }>>('/daily-reminders');
  if (!users?.length) return;
  for (const user of users) {
    try {
      await bot.telegram.sendMessage(
        user.telegramId,
        `Привет, ${escapeHtml(user.firstName)}! 🎁\n\nЕжедневная награда ещё не получена. Забери бонус и продолжи серию — каждый день награда больше.`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [screenButton('🎁 Забрать награду', 'wallet')],
          ]).reply_markup,
        },
      );
    } catch (error) {
      console.warn('[reminder]', user.telegramId, error instanceof Error ? error.message : error);
    }
  }
}

bot.launch(() => {
  console.log(`🤖 FUNBOX bot @${BOT_USERNAME} is running`);
  console.log(`   Mini App: ${WEBAPP_URL}`);
  setTimeout(() => void dailyReminders(), 15_000);
  setInterval(() => void dailyReminders(), 30 * 60 * 1000);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
