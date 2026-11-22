import { PrismaClient } from '@prisma/client';
import type { AchievementRarity, Prisma, QuestMetric } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO = process.env.SEED_MODE !== 'production';

function levelFromXp(xp: number) {
  return Math.min(100, Math.max(1, Math.floor(Math.sqrt(xp / 50)) + 1));
}

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const dailyKey = `daily:${dateKey()}`;
const weeklyKey = `weekly:${isoWeekKey()}`;

function readImageManifest(): Record<
  string,
  { file: string; title: string; descriptionUrl: string; artist: string; license: string; subject: string }
> {
  const candidates = [
    path.resolve(__dirname, '../../web/public/images/guess/manifest.json'),
    path.resolve(__dirname, '../../web/dist/images/guess/manifest.json'),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const manifest = readImageManifest();
const imageUrl = (slug: string) => {
  const entry = manifest[slug];
  return entry ? `/images/guess/${entry.file}` : null;
};

async function truncate() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Notification", "ActivityLog", "Purchase", "ShopItem", "PlatformEvent",
      "DailyClaim", "Transaction", "UserQuest", "Quest", "UserAchievement", "Achievement",
      "ImageAttempt", "WouldYouRatherVote", "GameResult", "GameAnswer", "GameParticipant",
      "GameRoomQuestion", "GameRoom", "GameQuestion", "Game", "Category",
      "MessageReceipt", "Message", "ConversationParticipant", "Conversation",
      "Report", "Like", "Comment", "Post", "Follow", "Block", "Friendship", "FriendRequest",
      "Wallet", "UserStat", "UserSettings", "UserProfile", "User"
    RESTART IDENTITY CASCADE
  `);
}

const gameSeeds = [
  {
    slug: 'quiz-battle',
    title: 'Quiz Battle',
    subtitle: 'Викторина на скорость',
    description: 'Сражайтесь с друзьями и соперниками в интеллектуальной битве. Чем быстрее ответ — тем больше очков.',
    icon: '⚡',
    gradient: 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 52%,#0ea5e9 100%)',
    minPlayers: 2,
    maxPlayers: 8,
    sortOrder: 1,
  },
  {
    slug: 'word-duel',
    title: 'Word Duel',
    subtitle: 'Словесная дуэль',
    description: 'Составляйте слова из общего набора букв. 90 секунд, живой соперник и словарь на 100 000 слов.',
    icon: '🔤',
    gradient: 'linear-gradient(135deg,#059669 0%,#0d9488 50%,#06b6d4 100%)',
    minPlayers: 2,
    maxPlayers: 2,
    sortOrder: 2,
  },
  {
    slug: 'would-you-rather',
    title: 'Would You Rather',
    subtitle: 'А ты бы выбрал?',
    description: 'Голосуйте за безумные варианты, сравнивайте себя с другими и создавайте собственные дилеммы.',
    icon: '🤔',
    gradient: 'linear-gradient(135deg,#db2777 0%,#e11d48 48%,#f97316 100%)',
    minPlayers: 1,
    maxPlayers: 1,
    sortOrder: 3,
  },
  {
    slug: 'guess-image',
    title: 'Guess the Image',
    subtitle: 'Угадай изображение',
    description: 'Три попытки, умные подсказки и красивые фотографии. Проверьте наблюдательность и эрудицию.',
    icon: '🖼️',
    gradient: 'linear-gradient(135deg,#d97706 0%,#dc2626 50%,#9333ea 100%)',
    minPlayers: 1,
    maxPlayers: 1,
    sortOrder: 4,
  },
];

const quizCategorySeeds = [
  { slug: 'general', name: 'Общие знания', icon: '🧠' },
  { slug: 'history', name: 'История', icon: '🏛️' },
  { slug: 'science', name: 'Наука', icon: '🔬' },
  { slug: 'movies', name: 'Кино', icon: '🎬' },
  { slug: 'sports', name: 'Спорт', icon: '🏆' },
  { slug: 'geography', name: 'География', icon: '🌍' },
  { slug: 'music', name: 'Музыка', icon: '🎵' },
];

const imageCategorySeeds = [
  { slug: 'landmarks', name: 'Достопримечательности', icon: '🗼' },
  { slug: 'food', name: 'Еда', icon: '🍕' },
  { slug: 'animals', name: 'Животные', icon: '🐼' },
  { slug: 'nature', name: 'Природа', icon: '🌌' },
  { slug: 'objects', name: 'Предметы', icon: '📷' },
];

const postTopicSeeds = [
  { slug: 'gaming', name: 'Гейминг', icon: '🎮' },
  { slug: 'music-talk', name: 'Музыка', icon: '🎧' },
  { slug: 'life', name: 'Жизнь', icon: '🌿' },
  { slug: 'humor', name: 'Юмор', icon: '😂' },
  { slug: 'ideas', name: 'Идеи', icon: '💡' },
];

const achievements: Array<{
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  metric: QuestMetric;
  threshold: number;
  xpReward: number;
  coinReward: number;
}> = [
  { code: 'first-game', name: 'First Game', description: 'Сыграйте свою первую игру', icon: '🎮', rarity: 'COMMON', metric: 'GAMES_PLAYED', threshold: 1, xpReward: 20, coinReward: 10 },
  { code: 'first-victory', name: 'First Victory', description: 'Одержите первую победу', icon: '🥇', rarity: 'COMMON', metric: 'GAMES_WON', threshold: 1, xpReward: 40, coinReward: 20 },
  { code: 'social-star', name: 'Social Star', description: 'Добавьте 3 друзей', icon: '🌟', rarity: 'RARE', metric: 'FRIENDS_ADDED', threshold: 3, xpReward: 80, coinReward: 50 },
  { code: 'quiz-master', name: 'Quiz Master', description: 'Выиграйте 5 викторин', icon: '🧠', rarity: 'EPIC', metric: 'QUIZ_WINS', threshold: 5, xpReward: 180, coinReward: 120 },
  { code: 'popular-creator', name: 'Popular Creator', description: 'Получите 10 лайков на публикациях', icon: '❤️', rarity: 'RARE', metric: 'LIKES_RECEIVED', threshold: 10, xpReward: 90, coinReward: 60 },
  { code: 'legendary-player', name: 'Legendary Player', description: 'Сыграйте 50 игр', icon: '👑', rarity: 'LEGENDARY', metric: 'GAMES_PLAYED', threshold: 50, xpReward: 500, coinReward: 400 },
  { code: 'chatterbox', name: 'Chatterbox', description: 'Отправьте 25 сообщений', icon: '💬', rarity: 'COMMON', metric: 'MESSAGES_SENT', threshold: 25, xpReward: 60, coinReward: 35 },
  { code: 'quest-hunter', name: 'Quest Hunter', description: 'Заработайте 1 000 XP', icon: '🗺️', rarity: 'EPIC', metric: 'XP_EARNED', threshold: 1000, xpReward: 200, coinReward: 150 },
  { code: 'daily-legend', name: 'Daily Legend', description: 'Заходите 7 дней подряд', icon: '🔥', rarity: 'EPIC', metric: 'LOGIN_STREAK', threshold: 7, xpReward: 150, coinReward: 100 },
  { code: 'image-sleuth', name: 'Image Sleuth', description: 'Угадайте 5 изображений', icon: '🔍', rarity: 'RARE', metric: 'IMAGES_GUESSED', threshold: 5, xpReward: 100, coinReward: 70 },
  { code: 'wordsmith', name: 'Wordsmith', description: 'Составьте 10 слов в Word Duel', icon: '📚', rarity: 'RARE', metric: 'WORDS_SUBMITTED', threshold: 10, xpReward: 100, coinReward: 60 },
  { code: 'debater', name: 'Debater', description: 'Проголосуйте 10 раз в Would You Rather', icon: '🗣️', rarity: 'COMMON', metric: 'WYR_VOTES', threshold: 10, xpReward: 70, coinReward: 40 },
  { code: 'connector', name: 'Connector', description: 'Соберите 10 друзей', icon: '🤝', rarity: 'EPIC', metric: 'FRIENDS_ADDED', threshold: 10, xpReward: 250, coinReward: 180 },
  { code: 'recruiter', name: 'Recruiter', description: 'Пригласите 3 друзей', icon: '🎁', rarity: 'EPIC', metric: 'REFERRALS', threshold: 3, xpReward: 220, coinReward: 200 },
  { code: 'creator', name: 'Creator', description: 'Опубликуйте 5 постов', icon: '✍️', rarity: 'RARE', metric: 'POSTS_CREATED', threshold: 5, xpReward: 110, coinReward: 65 },
  { code: 'rising-star', name: 'Rising Star', description: 'Достигните 5 уровня', icon: '⭐', rarity: 'RARE', metric: 'XP_EARNED', threshold: 700, xpReward: 120, coinReward: 80 },
];

const quests: Array<{
  code: string;
  title: string;
  description: string;
  icon: string;
  period: 'ONBOARDING' | 'DAILY' | 'WEEKLY' | 'SPECIAL';
  metric: QuestMetric;
  target: number;
  xpReward: number;
  coinReward: number;
  sortOrder: number;
}> = [
  { code: 'daily-play-3', title: 'Разогрев', description: 'Сыграйте 3 игры за сегодня', icon: '🎮', period: 'DAILY', metric: 'GAMES_PLAYED', target: 3, xpReward: 45, coinReward: 25, sortOrder: 1 },
  { code: 'daily-win-1', title: 'Вкус победы', description: 'Одержите 1 победу сегодня', icon: '🏆', period: 'DAILY', metric: 'GAMES_WON', target: 1, xpReward: 50, coinReward: 30, sortOrder: 2 },
  { code: 'daily-post', title: 'Поделитесь мыслью', description: 'Опубликуйте пост в ленте', icon: '✍️', period: 'DAILY', metric: 'POSTS_CREATED', target: 1, xpReward: 30, coinReward: 15, sortOrder: 3 },
  { code: 'daily-likes', title: 'Щедрый лайк', description: 'Поставьте 3 лайка', icon: '❤️', period: 'DAILY', metric: 'LIKES_GIVEN', target: 3, xpReward: 25, coinReward: 12, sortOrder: 4 },
  { code: 'daily-wyr', title: 'Сложный выбор', description: 'Проголосуйте в 2 дилеммах', icon: '🤔', period: 'DAILY', metric: 'WYR_VOTES', target: 2, xpReward: 25, coinReward: 12, sortOrder: 5 },
  { code: 'weekly-play-10', title: 'Марафонец', description: 'Сыграйте 10 игр за неделю', icon: '🏃', period: 'WEEKLY', metric: 'GAMES_PLAYED', target: 10, xpReward: 180, coinReward: 100, sortOrder: 1 },
  { code: 'weekly-friends-2', title: 'Социальная сеть', description: 'Добавьте 2 друзей за неделю', icon: '👥', period: 'WEEKLY', metric: 'FRIENDS_ADDED', target: 2, xpReward: 140, coinReward: 80, sortOrder: 2 },
  { code: 'weekly-quiz-2', title: 'Знаток', description: 'Выиграйте 2 викторины за неделю', icon: '🧠', period: 'WEEKLY', metric: 'QUIZ_WINS', target: 2, xpReward: 160, coinReward: 90, sortOrder: 3 },
  { code: 'weekly-messages', title: 'Душа компании', description: 'Отправьте 15 сообщений', icon: '💬', period: 'WEEKLY', metric: 'MESSAGES_SENT', target: 15, xpReward: 120, coinReward: 60, sortOrder: 4 },
  { code: 'onboarding-profile', title: 'Лицо FUNBOX', description: 'Заполните профиль и добавьте био', icon: '🪪', period: 'ONBOARDING', metric: 'PROFILE_COMPLETED', target: 1, xpReward: 50, coinReward: 40, sortOrder: 1 },
  { code: 'onboarding-game', title: 'Первый шаг', description: 'Сыграйте любую игру', icon: '🚀', period: 'ONBOARDING', metric: 'GAMES_PLAYED', target: 1, xpReward: 35, coinReward: 25, sortOrder: 2 },
  { code: 'onboarding-friend', title: 'Не играй один', description: 'Добавьте первого друга', icon: '🤝', period: 'ONBOARDING', metric: 'FRIENDS_ADDED', target: 1, xpReward: 45, coinReward: 30, sortOrder: 3 },
  { code: 'referral-1', title: 'Амбассадор', description: 'Пригласите друга по ссылке', icon: '🎁', period: 'SPECIAL', metric: 'REFERRALS', target: 1, xpReward: 100, coinReward: 100, sortOrder: 1 },
];

const shopSeeds = [
  { code: 'neon-accent', name: 'Neon Violet', description: 'Фиолетовый неоновый акцент профиля', icon: '🟣', type: 'THEME' as const, price: 350, rarity: 'RARE' as const, payload: { accentColor: '#a855f7' }, sortOrder: 1 },
  { code: 'sunset-accent', name: 'Sunset Pink', description: 'Розовый закатный акцент', icon: '🌸', type: 'THEME' as const, price: 350, rarity: 'RARE' as const, payload: { accentColor: '#ec4899' }, sortOrder: 2 },
  { code: 'ocean-accent', name: 'Deep Ocean', description: 'Глубокий синий акцент профиля', icon: '🌊', type: 'THEME' as const, price: 300, rarity: 'COMMON' as const, payload: { accentColor: '#0ea5e9' }, sortOrder: 3 },
  { code: 'golden-badge', name: 'Golden Badge', description: 'Золотой значок в профиле', icon: '🏅', type: 'BADGE' as const, price: 900, rarity: 'EPIC' as const, sortOrder: 4 },
  { code: 'legend-title', name: 'LEGEND', description: 'Титул легенды FUNBOX', icon: '👑', type: 'TITLE' as const, price: 1500, rarity: 'LEGENDARY' as const, sortOrder: 5 },
  { code: 'light-theme', name: 'Daylight', description: 'Светлая тема интерфейса', icon: '☀️', type: 'THEME' as const, price: 500, rarity: 'RARE' as const, payload: { theme: 'light' }, sortOrder: 6 },
  { code: 'rocket-avatar', name: 'Cosmo Frame', description: 'Космическая рамка аватара', icon: '🚀', type: 'AVATAR' as const, price: 650, rarity: 'EPIC' as const, sortOrder: 7 },
  { code: 'fire-sticker', name: 'Fire Pack', description: 'Набор огненных стикеров', icon: '🔥', type: 'STICKER' as const, price: 250, rarity: 'COMMON' as const, sortOrder: 8 },
];

interface SeedUser {
  telegramId: string;
  username: string;
  firstName: string;
  lastName?: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  xp: number;
  coins: number;
  bio: string;
  displayName: string;
  accent: string;
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    quizWins: number;
    friendsCount: number;
    postsCount: number;
    likesReceived: number;
    messagesSent: number;
    wordsSubmitted: number;
    imagesGuessed: number;
    wyrVotes: number;
    loginStreak: number;
    xpEarned: number;
    coinsEarned: number;
  };
}

const userSeeds: SeedUser[] = [
  {
    telegramId: '900000000', username: 'funbox_admin', firstName: 'Алекс', lastName: 'Крамер', role: 'ADMIN', xp: 12400, coins: 9800,
    bio: 'Создаю FUNBOX. Слежу за порядком и новыми играми.', displayName: 'Алекс', accent: '#8b5cf6',
    stats: { gamesPlayed: 88, gamesWon: 49, quizWins: 21, friendsCount: 12, postsCount: 9, likesReceived: 240, messagesSent: 180, wordsSubmitted: 44, imagesGuessed: 18, wyrVotes: 26, loginStreak: 12, xpEarned: 12400, coinsEarned: 11800 },
  },
  {
    telegramId: '900000001', username: 'nova_fun', firstName: 'Нова', lastName: 'Соколова', role: 'USER', xp: 5450, coins: 2450,
    bio: 'Квизы, аврора и ночные разговоры. Ищу команду для Quiz Battle 🌌', displayName: 'Нова', accent: '#a855f7',
    stats: { gamesPlayed: 48, gamesWon: 27, quizWins: 11, friendsCount: 5, postsCount: 7, likesReceived: 120, messagesSent: 96, wordsSubmitted: 31, imagesGuessed: 8, wyrVotes: 17, loginStreak: 14, xpEarned: 5450, coinsEarned: 4200 },
  },
  {
    telegramId: '900000002', username: 'max_play', firstName: 'Макс', lastName: 'Волков', role: 'USER', xp: 4320, coins: 1880,
    bio: 'Word Duel — моя стихия. 9 слов за раунд, кто больше?', displayName: 'Макс', accent: '#22d3ee',
    stats: { gamesPlayed: 41, gamesWon: 22, quizWins: 6, friendsCount: 6, postsCount: 5, likesReceived: 86, messagesSent: 72, wordsSubmitted: 88, imagesGuessed: 4, wyrVotes: 9, loginStreak: 6, xpEarned: 4320, coinsEarned: 3100 },
  },
  {
    telegramId: '900000003', username: 'eva_quiz', firstName: 'Ева', lastName: 'Литвинова', role: 'USER', xp: 6100, coins: 3210,
    bio: 'Знаток кино и географии. Попробуй обыграть меня в викторине.', displayName: 'Ева', accent: '#ec4899',
    stats: { gamesPlayed: 53, gamesWon: 31, quizWins: 19, friendsCount: 7, postsCount: 6, likesReceived: 155, messagesSent: 110, wordsSubmitted: 21, imagesGuessed: 12, wyrVotes: 22, loginStreak: 9, xpEarned: 6100, coinsEarned: 4700 },
  },
  {
    telegramId: '900000004', username: 'leo_words', firstName: 'Лео', lastName: 'Громов', role: 'USER', xp: 2980, coins: 1260,
    bio: 'Собираю слова и коллекционирую победы. Иногда рисую.', displayName: 'Лео', accent: '#f59e0b',
    stats: { gamesPlayed: 27, gamesWon: 12, quizWins: 3, friendsCount: 4, postsCount: 4, likesReceived: 64, messagesSent: 58, wordsSubmitted: 54, imagesGuessed: 6, wyrVotes: 13, loginStreak: 4, xpEarned: 2980, coinsEarned: 1900 },
  },
  {
    telegramId: '900000005', username: 'kira_moon', firstName: 'Кира', lastName: 'Мун', role: 'USER', xp: 7200, coins: 4600,
    bio: 'Ночной марафон квизов. Не сплю, пока не выиграю.', displayName: 'Кира', accent: '#818cf8',
    stats: { gamesPlayed: 61, gamesWon: 35, quizWins: 24, friendsCount: 8, postsCount: 8, likesReceived: 188, messagesSent: 143, wordsSubmitted: 18, imagesGuessed: 15, wyrVotes: 31, loginStreak: 11, xpEarned: 7200, coinsEarned: 5600 },
  },
  {
    telegramId: '900000006', username: 'tim_arcade', firstName: 'Тим', lastName: 'Орлов', role: 'USER', xp: 2100, coins: 960,
    bio: 'Arcade soul. Здесь за атмосферой и друзьями.', displayName: 'Тим', accent: '#34d399',
    stats: { gamesPlayed: 19, gamesWon: 8, quizWins: 2, friendsCount: 3, postsCount: 3, likesReceived: 32, messagesSent: 40, wordsSubmitted: 16, imagesGuessed: 2, wyrVotes: 6, loginStreak: 3, xpEarned: 2100, coinsEarned: 1200 },
  },
  {
    telegramId: '900000007', username: 'mira_light', firstName: 'Мира', lastName: 'Белкина', role: 'USER', xp: 1580, coins: 720,
    bio: 'Люблю красивые фотографии и неожиданные вопросы.', displayName: 'Мира', accent: '#f472b6',
    stats: { gamesPlayed: 14, gamesWon: 5, quizWins: 1, friendsCount: 2, postsCount: 2, likesReceived: 28, messagesSent: 22, wordsSubmitted: 9, imagesGuessed: 7, wyrVotes: 15, loginStreak: 2, xpEarned: 1580, coinsEarned: 900 },
  },
  {
    telegramId: '900000008', username: 'dan_storm', firstName: 'Дэн', lastName: 'Шторм', role: 'USER', xp: 3800, coins: 1450,
    bio: 'Спорт, кино и немного хаоса.', displayName: 'Дэн', accent: '#fb7185',
    stats: { gamesPlayed: 33, gamesWon: 17, quizWins: 8, friendsCount: 5, postsCount: 3, likesReceived: 47, messagesSent: 31, wordsSubmitted: 12, imagesGuessed: 5, wyrVotes: 11, loginStreak: 5, xpEarned: 3800, coinsEarned: 2400 },
  },
  {
    telegramId: '900000009', username: 'luna_play', firstName: 'Луна', lastName: 'Рей', role: 'MODERATOR', xp: 8600, coins: 5200,
    bio: 'Модератор FUNBOX. Слежу, чтобы здесь было уютно.', displayName: 'Луна', accent: '#c084fc',
    stats: { gamesPlayed: 70, gamesWon: 38, quizWins: 17, friendsCount: 10, postsCount: 5, likesReceived: 205, messagesSent: 230, wordsSubmitted: 25, imagesGuessed: 14, wyrVotes: 28, loginStreak: 18, xpEarned: 8600, coinsEarned: 7100 },
  },
  {
    telegramId: '900000010', username: 'sasha_vibe', firstName: 'Саша', lastName: 'Вайб', role: 'USER', xp: 1900, coins: 840,
    bio: 'Музыка, мемы и хорошее настроение.', displayName: 'Саша', accent: '#fbbf24',
    stats: { gamesPlayed: 16, gamesWon: 6, quizWins: 2, friendsCount: 3, postsCount: 6, likesReceived: 54, messagesSent: 64, wordsSubmitted: 7, imagesGuessed: 3, wyrVotes: 8, loginStreak: 3, xpEarned: 1900, coinsEarned: 1100 },
  },
  {
    telegramId: '900000011', username: 'ivan_quest', firstName: 'Иван', lastName: 'Заря', role: 'USER', xp: 3300, coins: 1520,
    bio: 'Квесты, достижения, 100% прогресс.', displayName: 'Иван', accent: '#60a5fa',
    stats: { gamesPlayed: 29, gamesWon: 14, quizWins: 5, friendsCount: 4, postsCount: 2, likesReceived: 39, messagesSent: 27, wordsSubmitted: 20, imagesGuessed: 6, wyrVotes: 10, loginStreak: 8, xpEarned: 3300, coinsEarned: 2300 },
  },
];

const quizQuestions: Array<{
  category: string;
  prompt: string;
  options: string[];
  correct: number;
  hint?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}> = [
  { category: 'general', prompt: 'Какая планета ближе всего к Солнцу?', options: ['Меркурий', 'Венера', 'Земля', 'Марс'], correct: 0, hint: 'Самая быстрая планета', difficulty: 'EASY' },
  { category: 'general', prompt: 'Сколько цветов в радуге?', options: ['5', '6', '7', '8'], correct: 2, difficulty: 'EASY' },
  { category: 'general', prompt: 'Столица Японии — это…', options: ['Осака', 'Токио', 'Киото', 'Сеул'], correct: 1, difficulty: 'EASY' },
  { category: 'general', prompt: 'Какой океан самый большой?', options: ['Атлантический', 'Индийский', 'Тихий', 'Северный Ледовитый'], correct: 2 },
  { category: 'general', prompt: 'Кто написал роман «Мастер и Маргарита»?', options: ['Достоевский', 'Булгаков', 'Набоков', 'Толстой'], correct: 1, difficulty: 'EASY' },
  { category: 'history', prompt: 'В каком году человек впервые полетел в космос?', options: ['1957', '1961', '1965', '1969'], correct: 1, hint: 'Гагарин, «Восток-1»' },
  { category: 'history', prompt: 'Кто был первым президентом США?', options: ['Авраам Линкольн', 'Джордж Вашингтон', 'Томас Джефферсон', 'Джон Адамс'], correct: 1, difficulty: 'EASY' },
  { category: 'history', prompt: 'В каком году началась Вторая мировая война?', options: ['1914', '1939', '1941', '1945'], correct: 1 },
  { category: 'history', prompt: 'Какая цивилизация построила Мачу-Пикчу?', options: ['Ацтеки', 'Майя', 'Инки', 'Ольмеки'], correct: 2 },
  { category: 'science', prompt: 'Какой химический символ у золота?', options: ['Ag', 'Au', 'Fe', 'Cu'], correct: 1, difficulty: 'EASY' },
  { category: 'science', prompt: 'Что измеряет вольтметр?', options: ['Силу тока', 'Напряжение', 'Сопротивление', 'Мощность'], correct: 1 },
  { category: 'science', prompt: 'Сколько костей в теле взрослого человека?', options: ['186', '206', '226', '246'], correct: 1, hint: 'Чуть больше двухсот' },
  { category: 'science', prompt: 'Какой газ преобладает в атмосфере Земли?', options: ['Кислород', 'Углекислый газ', 'Азот', 'Аргон'], correct: 2 },
  { category: 'movies', prompt: 'Кто снял фильм «Начало» (Inception)?', options: ['Кристофер Нолан', 'Дэвид Финчер', 'Дени Вильнёв', 'Джеймс Кэмерон'], correct: 0 },
  { category: 'movies', prompt: 'Как зовут хоббита, который понёс Кольцо в Мордор?', options: ['Сэм', 'Фродо', 'Мерри', 'Пиппин'], correct: 1, difficulty: 'EASY' },
  { category: 'movies', prompt: 'Сколько фильмов в оригинальной трилогии «Властелин колец»?', options: ['2', '3', '4', '5'], correct: 1, difficulty: 'EASY' },
  { category: 'movies', prompt: 'Кто озвучил Шрека в оригинальной версии?', options: ['Эдди Мёрфи', 'Майк Майерс', 'Кэмерон Диас', 'Джон Литгоу'], correct: 1 },
  { category: 'sports', prompt: 'Сколько игроков одной команды находится на футбольном поле?', options: ['9', '10', '11', '12'], correct: 2, difficulty: 'EASY' },
  { category: 'sports', prompt: 'Сколько очков даёт трёхочковый бросок в баскетболе?', options: ['1', '2', '3', '4'], correct: 2, difficulty: 'EASY' },
  { category: 'sports', prompt: 'В какой стране прошли летние Олимпийские игры 2016 года?', options: ['Китай', 'Бразилия', 'Великобритания', 'Япония'], correct: 1 },
  { category: 'sports', prompt: 'Как часто проводятся летние Олимпийские игры?', options: ['Каждый год', 'Раз в 2 года', 'Раз в 4 года', 'Раз в 5 лет'], correct: 2, difficulty: 'EASY' },
  { category: 'geography', prompt: 'Самая высокая гора мира — это…', options: ['К2', 'Эверест', 'Килиманджаро', 'Эльбрус'], correct: 1, difficulty: 'EASY' },
  { category: 'geography', prompt: 'Какой континент самый маленький?', options: ['Европа', 'Антарктида', 'Австралия', 'Южная Америка'], correct: 2 },
  { category: 'geography', prompt: 'В какой стране находится вулкан Фудзи?', options: ['Китай', 'Япония', 'Индонезия', 'Филиппины'], correct: 1, difficulty: 'EASY' },
  { category: 'geography', prompt: 'Какое море самое солёное?', options: ['Чёрное', 'Красное', 'Мёртвое', 'Средиземное'], correct: 2 },
  { category: 'music', prompt: 'Сколько струн у классической гитары?', options: ['4', '5', '6', '7'], correct: 2, difficulty: 'EASY' },
  { category: 'music', prompt: 'Кто написал «Лунную сонату»?', options: ['Моцарт', 'Бетховен', 'Бах', 'Шопен'], correct: 1 },
  { category: 'music', prompt: 'Сколько клавиш у стандартного пианино?', options: ['76', '81', '88', '96'], correct: 2, hint: 'Больше 80' },
  { category: 'music', prompt: 'Что означает аббревиатура BPM?', options: ['Биты в минуту', 'Басовая партия', 'Большой пауэр-микс', 'Бит-поп-музыка'], correct: 0, difficulty: 'EASY' },
];

const wyrQuestions = [
  ['Уметь летать, но только на высоте одного метра', 'Становиться невидимым на 10 минут в день'],
  ['Жить без интернета', 'Жить без музыки'],
  ['Всегда опаздывать', 'Всегда ждать других'],
  ['Есть пиццу с ананасом всю жизнь', 'Никогда больше не есть пиццу'],
  ['Говорить на всех языках мира', 'Играть на всех музыкальных инструментах'],
  ['Иметь личного робота-помощника', 'Иметь портал в любую точку планеты'],
  ['Путешествовать во времени только в прошлое', 'Только в будущее'],
  ['Читать мысли людей', 'Быть невидимым по желанию'],
  ['Жить в горах', 'Жить у океана'],
  ['Никогда не спать', 'Никогда не есть сладкое'],
  ['Всегда говорить только правду', 'Никогда не говорить вообще'],
  ['Бесконечный заряд телефона', 'Бесконечный запас любимого кофе'],
  ['Проснуться знаменитым', 'Проснуться гением'],
  ['Менять внешность раз в день', 'Менять голос раз в день'],
  ['Жить в мире без войн', 'Жить в мире без болезней'],
  ['Знать дату своей смерти', 'Знать все выигрышные лотерейные номера'],
  ['Дружить с драконом', 'Дружить с пиратом'],
  ['Иметь хвост', 'Иметь крылья'],
  ['Застрять в 90-х на год', 'Провести год в будущем'],
  ['Всегда быть онлайн', 'Полностью исчезать на один день каждую неделю'],
];

const guessAnswers: Record<string, { answer: string; hints: string[]; category: string }> = {
  'eiffel-tower': { answer: 'Эйфелева башня', hints: ['Главный символ Парижа', 'Металлическая конструкция XIX века', 'Её высота — около 330 метров'], category: 'landmarks' },
  'statue-of-liberty': { answer: 'Статуя Свободы', hints: ['Подарок Франции Соединённым Штатам', 'Стоит в Нью-Йоркской бухте', 'Держит факел в правой руке'], category: 'landmarks' },
  pyramids: { answer: 'Пирамиды Гизы', hints: ['Находятся в Египте', 'Одно из семи чудес древнего мира', 'Рядом находится Большой Сфинкс'], category: 'landmarks' },
  'great-wall': { answer: 'Великая Китайская стена', hints: ['Её строили несколько столетий', 'Тянется по северу Китая', 'Это объект Всемирного наследия ЮНЕСКО'], category: 'landmarks' },
  'taj-mahal': { answer: 'Тадж-Махал', hints: ['Находится в Индии', 'Мавзолей из белого мрамора', 'Построен по приказу Шах-Джахана'], category: 'landmarks' },
  colosseum: { answer: 'Колизей', hints: ['Находится в Риме', 'Амфитеатр для гладиаторских боёв', 'Построен в I веке н. э.'], category: 'landmarks' },
  pizza: { answer: 'Пицца', hints: ['Итальянское блюдо', 'Круглая основа из теста', 'Главные ингредиенты — томат и сыр'], category: 'food' },
  sushi: { answer: 'Суши', hints: ['Блюдо японской кухни', 'Рис и сырая рыба', 'Часто подаётся с васаби'], category: 'food' },
  croissant: { answer: 'Круассан', hints: ['Французская выпечка', 'Форма полумесяца', 'Готовится из слоёного теста'], category: 'food' },
  hamburger: { answer: 'Гамбургер', hints: ['Блюдо фастфуда', 'Булочка с котлетой', 'Часто подаётся с картошкой'], category: 'food' },
  guitar: { answer: 'Гитара', hints: ['Струнный инструмент', 'Шесть струн у классической модели', 'На ней играют пальцами или медиатором'], category: 'objects' },
  camera: { answer: 'Фотоаппарат', hints: ['Оптический прибор', 'Используется для съёмки', 'Имеет объектив и затвор'], category: 'objects' },
  typewriter: { answer: 'Печатная машинка', hints: ['Механическое устройство', 'Использовалась для набора текста', 'Клавиши бьют по бумаге'], category: 'objects' },
  compass: { answer: 'Компас', hints: ['Навигационный прибор', 'Показывает стороны света', 'Внутри — магнитная стрелка'], category: 'objects' },
  chess: { answer: 'Шахматы', hints: ['Настольная логическая игра', 'Поле 8 на 8', 'Есть король, ферзь и пешки'], category: 'objects' },
  'red-panda': { answer: 'Красная панда', hints: ['Небольшой пушистый зверь', 'Живёт в Гималаях', 'Рыжий хвост с кольцами'], category: 'animals' },
  axolotl: { answer: 'Аксолотль', hints: ['Земноводное', 'Знаменит способностью регенерировать конечности', 'Живёт в Мексике'], category: 'animals' },
  flamingo: { answer: 'Фламинго', hints: ['Розовая птица', 'Часто стоит на одной ноге', 'Живёт у солёных водоёмов'], category: 'animals' },
  koala: { answer: 'Коала', hints: ['Сумчатое животное', 'Живёт в Австралии', 'Питается эвкалиптом'], category: 'animals' },
  panda: { answer: 'Большая панда', hints: ['Чёрно-белый медведь', 'Символ Китая', 'Питается бамбуком'], category: 'animals' },
  balloon: { answer: 'Воздушный шар', hints: ['Летательный аппарат', 'Наполняется горячим воздухом', 'Используется для прогулок'], category: 'nature' },
  aurora: { answer: 'Северное сияние', hints: ['Оптическое явление в атмосфере', 'Чаще всего видно в полярных широтах', 'Зелёные и фиолетовые всполохи'], category: 'nature' },
  sakura: { answer: 'Сакура', hints: ['Символ Японии', 'Цветёт весной', 'Розовые лепестки'], category: 'nature' },
  lighthouse: { answer: 'Маяк', hints: ['Стоит на берегу', 'Помогает кораблям', 'Испускает световой сигнал'], category: 'nature' },
};

async function main() {
  if (DEMO) {
    console.log('🌱 Seeding FUNBOX demo database…');
    await truncate();
  } else {
    console.log('🌱 Seeding FUNBOX production content (no demo users)…');
    if (process.env.SEED_RESET === 'true') {
      console.log('⚠️  SEED_RESET=true — очищаем таблицы перед production seed.');
      await truncate();
    }
    const existingGames = await prisma.game.count();
    if (existingGames > 0) {
      console.log('✅ Content already exists — production seed skipped.');
      return;
    }
  }

  const games = new Map<string, { id: string }>();
  for (const data of gameSeeds) {
    const game = await prisma.game.create({ data });
    games.set(game.slug, game);
  }

  const categories = new Map<string, { id: string }>();
  for (const data of [...quizCategorySeeds, ...imageCategorySeeds, ...postTopicSeeds]) {
    const type = imageCategorySeeds.some((item) => item.slug === data.slug)
      ? 'QUIZ'
      : postTopicSeeds.some((item) => item.slug === data.slug)
        ? 'POST'
        : 'QUIZ';
    const category = await prisma.category.create({
      data: { ...data, type: type as 'QUIZ' | 'POST' },
    });
    categories.set(category.slug, category);
  }

  const achievementRows = new Map<string, { id: string; xpReward: number; coinReward: number }>();
  for (const data of achievements) {
    const row = await prisma.achievement.create({ data });
    achievementRows.set(row.code, row);
  }

  const questRows = new Map<string, { id: string; metric: QuestMetric; target: number; period: string; xpReward: number; coinReward: number }>();
  for (const data of quests) {
    const row = await prisma.quest.create({ data });
    questRows.set(row.code, row);
  }

  for (const data of shopSeeds) {
    await prisma.shopItem.create({ data: { ...data, payload: data.payload as Prisma.InputJsonValue | undefined } });
  }

  const now = Date.now();
  const events = [
    {
      title: 'Ночной марафон Quiz Battle',
      description: 'Каждый вечер с 20:00 до 23:00 — двойные очки за быстрые ответы. Собирайте команду!',
      icon: '🌙',
      gradient: 'linear-gradient(135deg,#4c1d95,#7c3aed,#0ea5e9)',
      rewardXp: 120,
      rewardCoins: 60,
    },
    {
      title: 'Неделя друзей',
      description: 'Пригласите друга по ссылке и получите +150 FUN Coins. Вместе веселее!',
      icon: '🤝',
      gradient: 'linear-gradient(135deg,#be123c,#ec4899,#f59e0b)',
      rewardXp: 80,
      rewardCoins: 150,
    },
    {
      title: 'Охотники за изображениями',
      description: 'Новые фотографии уже в игре. Угадайте 5 подряд и попадёте в топ.',
      icon: '📸',
      gradient: 'linear-gradient(135deg,#065f46,#0d9488,#84cc16)',
      rewardXp: 60,
      rewardCoins: 40,
    },
  ];
  await prisma.platformEvent.createMany({
    data: events.map((event, index) => ({
      ...event,
      startsAt: new Date(now - 24 * 60 * 60 * 1000),
      endsAt: new Date(now + (index + 2) * 24 * 60 * 60 * 1000),
    })),
  });

  const quizGame = games.get('quiz-battle')!;
  for (const question of quizQuestions) {
    await prisma.gameQuestion.create({
      data: {
        gameId: quizGame.id,
        categoryId: categories.get(question.category)?.id,
        prompt: question.prompt,
        options: question.options as Prisma.InputJsonValue,
        correctOption: question.correct,
        hint: question.hint,
        difficulty: question.difficulty ?? 'MEDIUM',
      },
    });
  }

  const wyrGame = games.get('would-you-rather')!;
  const wyrQuestionIds: string[] = [];
  for (const [optionA, optionB] of wyrQuestions) {
    const question = await prisma.gameQuestion.create({
      data: {
        gameId: wyrGame.id,
        prompt: 'Что вы выберете?',
        options: [optionA, optionB] as Prisma.InputJsonValue,
        difficulty: 'EASY',
      },
    });
    wyrQuestionIds.push(question.id);
  }

  const guessGame = games.get('guess-image')!;
  const usedImages = new Set<string>();
  for (const [slug, meta] of Object.entries(guessAnswers)) {
    const url = imageUrl(slug);
    if (!url) {
      console.warn(`  ! image missing: ${slug}`);
      continue;
    }
    usedImages.add(slug);
    await prisma.gameQuestion.create({
      data: {
        gameId: guessGame.id,
        categoryId: categories.get(meta.category)?.id,
        prompt: 'Что изображено на фотографии?',
        options: meta.hints as Prisma.InputJsonValue,
        answerText: meta.answer,
        hint: meta.hints[0],
        mediaUrl: url,
        difficulty: meta.category === 'landmarks' ? 'MEDIUM' : 'EASY',
      },
    });
  }

  if (!DEMO) {
    const counts = {
      games: await prisma.game.count(),
      categories: await prisma.category.count(),
      questions: await prisma.gameQuestion.count(),
      achievements: await prisma.achievement.count(),
      quests: await prisma.quest.count(),
      shop: await prisma.shopItem.count(),
      events: await prisma.platformEvent.count(),
      users: await prisma.user.count(),
    };
    console.log('✅ Production content seeded:', counts);
    return;
  }

  const users = new Map<string, { id: string; username: string; firstName: string }>();
  for (const [index, data] of userSeeds.entries()) {
    const level = levelFromXp(data.xp);
    const createdAt = new Date(now - (userSeeds.length - index) * 9 * 24 * 60 * 60 * 1000);
    const user = await prisma.user.create({
      data: {
        telegramId: data.telegramId,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        xp: data.xp,
        level,
        coins: data.coins,
        referralCode: `FB${data.telegramId.slice(-6)}`,
        createdAt,
        lastActiveAt: new Date(now - index * 37 * 60 * 1000),
        avatarUrl: `/avatars/${data.username}.svg`,
        profile: {
          create: {
            displayName: data.displayName,
            bio: data.bio,
            accentColor: data.accent,
            profileCompleted: true,
            hideFriends: false,
            hideActivity: false,
          },
        },
        settings: { create: {} },
        wallet: { create: { totalEarned: data.stats.coinsEarned, totalSpent: Math.max(0, data.stats.coinsEarned - data.coins) } },
        stats: {
          create: {
            ...data.stats,
            likesGiven: 40 + index * 3,
            commentsCount: 5 + index,
            referrals: index === 1 ? 4 : index === 2 ? 2 : 0,
            bestLoginStreak: data.stats.loginStreak + 2,
          },
        },
      },
    });
    users.set(data.username, user);
  }

  const nova = users.get('nova_fun')!;
  const max = users.get('max_play')!;
  const eva = users.get('eva_quiz')!;
  const leo = users.get('leo_words')!;
  const kira = users.get('kira_moon')!;
  const tim = users.get('tim_arcade')!;
  const mira = users.get('mira_light')!;
  const dan = users.get('dan_storm')!;
  const luna = users.get('luna_play')!;
  const sasha = users.get('sasha_vibe')!;
  const ivan = users.get('ivan_quest')!;
  const admin = users.get('funbox_admin')!;

  const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);
  const friendPairs = [
    [nova.id, max.id], [nova.id, eva.id], [nova.id, leo.id], [nova.id, kira.id], [nova.id, tim.id],
    [max.id, leo.id], [max.id, dan.id], [eva.id, kira.id], [eva.id, luna.id], [leo.id, mira.id],
    [kira.id, luna.id], [tim.id, sasha.id], [dan.id, sasha.id], [ivan.id, nova.id], [ivan.id, max.id],
    [admin.id, nova.id], [admin.id, max.id], [admin.id, eva.id], [luna.id, admin.id], [mira.id, sasha.id],
  ];
  for (const [a, b] of friendPairs) {
    const [userAId, userBId] = pair(a, b);
    await prisma.friendship.create({ data: { userAId, userBId } });
  }

  await prisma.friendRequest.createMany({
    data: [
      { senderId: mira.id, receiverId: nova.id, status: 'PENDING', message: 'Привет! Играем в квиз?' },
      { senderId: dan.id, receiverId: nova.id, status: 'PENDING', message: 'Ищу напарника для Word Duel' },
      { senderId: nova.id, receiverId: sasha.id, status: 'PENDING', message: 'Видела твой пост про музыку 🔥' },
    ],
  });

  const follows = [
    [nova.id, eva.id], [nova.id, kira.id], [nova.id, luna.id], [nova.id, sasha.id],
    [max.id, nova.id], [eva.id, nova.id], [leo.id, nova.id], [mira.id, eva.id],
    [tim.id, kira.id], [dan.id, max.id], [sasha.id, eva.id], [ivan.id, luna.id],
  ];
  for (const [followerId, followingId] of follows) {
    await prisma.follow.create({ data: { followerId, followingId } });
  }

  const allUsers = [...users.values()];
  for (const [questionIndex, questionId] of wyrQuestionIds.entries()) {
    const voters = allUsers.filter((_, userIndex) => (userIndex + questionIndex) % 3 !== 0);
    await prisma.wouldYouRatherVote.createMany({
      data: voters.map((user, userIndex) => ({
        questionId,
        userId: user.id,
        choice: (userIndex + questionIndex) % 2,
        createdAt: new Date(now - (userIndex + 1) * 37 * 60 * 1000),
      })),
      skipDuplicates: true,
    });
  }

  for (const user of users.values()) {
    const friendsCount = await prisma.friendship.count({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    });
    await prisma.userStat.update({ where: { userId: user.id }, data: { friendsCount } });
  }

  const postData = [
    {
      authorId: nova.id,
      content: 'Северное сияние вживую — это магия, которую не передать ни одним фильтром. Поймала момент вчера ночью. Кто ещё охотится за авророй? 🌌',
      imageUrl: imageUrl('aurora'),
      categoryId: categories.get('life')?.id,
      likes: [max.id, eva.id, leo.id, kira.id, luna.id, tim.id, admin.id],
      comments: [
        { authorId: eva.id, content: 'Невероятно! Добавь в коллекцию достижений «Image Sleuth» 😍' },
        { authorId: max.id, content: 'Это же готовый кадр для обложки. Куда ездила?' },
      ],
      hoursAgo: 2,
    },
    {
      authorId: max.id,
      content: 'Собрал 9 слов в Word Duel за 90 секунд. Кажется, пора бросать вызов Еве 👀 Кто готов?',
      categoryId: categories.get('gaming')?.id,
      likes: [nova.id, leo.id, dan.id, kira.id, ivan.id],
      comments: [{ authorId: leo.id, content: '9 — сильно. Мой рекорд 7, но я вернусь.' }],
      hoursAgo: 5,
    },
    {
      authorId: eva.id,
      content: 'Маленький лайфхак для Quiz Battle: не пытайтесь ответить первым любой ценой. Скорость даёт бонус, но ошибка обнуляет всё. Иногда стоит подождать 2 секунды и выбрать точно 🧠',
      categoryId: categories.get('gaming')?.id,
      likes: [nova.id, max.id, kira.id, luna.id, tim.id, sasha.id, ivan.id, mira.id],
      comments: [
        { authorId: nova.id, content: 'Золотые слова. Особенно на вопросах про географию 😅' },
        { authorId: kira.id, content: 'А я всё равно жму первое, что вижу. Азарт!' },
      ],
      hoursAgo: 9,
    },
    {
      authorId: leo.id,
      content: 'Пятничный вечер по плану: пицца, ночной марафон квизов и ноль сообщений до утра. Кто со мной? 🍕',
      imageUrl: imageUrl('pizza'),
      categoryId: categories.get('life')?.id,
      likes: [nova.id, max.id, eva.id, tim.id, dan.id],
      comments: [{ authorId: max.id, content: 'Только если викторина про кино. Там я непобедим.' }],
      hoursAgo: 14,
    },
    {
      authorId: kira.id,
      content: '24 победы в квизах. Следующая цель — 30 и звание Quiz Master. Кто хочет стать частью статистики? 😈',
      categoryId: categories.get('humor')?.id,
      likes: [eva.id, luna.id, nova.id, max.id, dan.id, tim.id],
      comments: [],
      hoursAgo: 20,
    },
    {
      authorId: sasha.id,
      content: 'Собрала плейлист для вечерних игр: немного synthwave, немного lo-fi, немного хаоса. Если зайдёте в голосовой чат — включу. 🎧',
      categoryId: categories.get('music-talk')?.id,
      likes: [nova.id, tim.id, leo.id],
      comments: [{ authorId: tim.id, content: 'Скинь ссылку, хочу в Word Duel под это.' }],
      hoursAgo: 27,
    },
    {
      authorId: admin.id,
      content: 'Обновление FUNBOX: в Guess the Image добавлены новые фотографии, а в магазине — светлая тема Daylight. Спасибо, что вы с нами! ✨',
      categoryId: categories.get('ideas')?.id,
      likes: [nova.id, max.id, eva.id, leo.id, kira.id, luna.id, tim.id, mira.id, dan.id, sasha.id, ivan.id],
      comments: [{ authorId: nova.id, content: 'Светлая тема — топ! Уже купила.' }],
      hoursAgo: 33,
    },
    {
      authorId: ivan.id,
      content: 'Закрыл все ежедневные задания до полудня. Кажется, у меня проблема. Или суперсила 🗿',
      categoryId: categories.get('humor')?.id,
      likes: [nova.id, max.id, sasha.id],
      comments: [],
      hoursAgo: 42,
    },
  ];

  const posts: Array<{ id: string; authorId: string }> = [];
  for (const data of postData) {
    const post = await prisma.post.create({
      data: {
        authorId: data.authorId,
        content: data.content,
        imageUrl: data.imageUrl ?? null,
        categoryId: data.categoryId ?? null,
        likeCount: data.likes.length,
        commentCount: data.comments.length,
        createdAt: new Date(now - data.hoursAgo * 60 * 60 * 1000),
      },
    });
    posts.push(post);
    await prisma.like.createMany({
      data: data.likes.map((userId) => ({ postId: post.id, userId, createdAt: new Date(now - data.hoursAgo * 60 * 60 * 1000 + 60000) })),
      skipDuplicates: true,
    });
    for (const [index, comment] of data.comments.entries()) {
      await prisma.comment.create({
        data: {
          postId: post.id,
          authorId: comment.authorId,
          content: comment.content,
          createdAt: new Date(now - data.hoursAgo * 60 * 60 * 1000 + (index + 1) * 8 * 60 * 1000),
        },
      });
    }
  }

  await prisma.post.create({
    data: {
      authorId: max.id,
      content: 'Репост: северное сияние от Новы. Это надо увидеть.',
      repostOfId: posts[0].id,
      repostCount: 0,
      createdAt: new Date(now - 60 * 60 * 1000),
    },
  });
  await prisma.post.update({ where: { id: posts[0].id }, data: { repostCount: 1 } });

  const conversations = [
    {
      participants: [nova.id, max.id],
      messages: [
        { senderId: max.id, content: 'Привет! Ты вчера была в топе квиза, круто сыграла 🔥', minutesAgo: 95 },
        { senderId: nova.id, content: 'Спасибо! Вопрос про Мачу-Пикчу спас меня в последнем раунде 😄', minutesAgo: 92 },
        { senderId: max.id, content: 'Сыграем сегодня? Хочу реванш в Word Duel', minutesAgo: 80 },
        { senderId: nova.id, content: 'Давай в 20:00. Только чур не подглядывать в словарь!', minutesAgo: 76 },
        { senderId: max.id, content: 'Обещаю 🤞', minutesAgo: 14 },
      ],
    },
    {
      participants: [nova.id, eva.id],
      messages: [
        { senderId: eva.id, content: 'Твой пост про аврору — просто космос. Где снимала?', minutesAgo: 180 },
        { senderId: nova.id, content: 'Под Мурманском. Ездили на три ночи, поймали на вторую!', minutesAgo: 174 },
        { senderId: eva.id, content: 'Завидую. Добавь фото в Guess the Image, пусть все угадывают 😅', minutesAgo: 168 },
      ],
    },
    {
      participants: [nova.id, leo.id],
      messages: [
        { senderId: leo.id, content: 'Привет! Видел тебя в топе. Может, сыграем в паре на выходных?', minutesAgo: 300 },
        { senderId: nova.id, content: 'Привет! Да, с удовольствием. Напиши в субботу утром.', minutesAgo: 280 },
      ],
    },
  ];

  for (const conv of conversations) {
    const lastAt = new Date(now - Math.min(...conv.messages.map((m) => m.minutesAgo)) * 60 * 1000);
    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        createdById: conv.participants[0],
        lastMessageAt: lastAt,
        participants: {
          create: conv.participants.map((userId) => ({
            userId,
            lastReadAt: userId === nova.id ? new Date(now - 10 * 60 * 1000) : new Date(now - 30 * 60 * 1000),
          })),
        },
      },
    });
    for (const message of conv.messages) {
      const createdAt = new Date(now - message.minutesAgo * 60 * 1000);
      const recipients = conv.participants.filter((id) => id !== message.senderId);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: message.senderId,
          content: message.content,
          createdAt,
          receipts: {
            create: recipients.map((userId) => ({
              userId,
              deliveredAt: createdAt,
              readAt: message.minutesAgo > 30 ? new Date(createdAt.getTime() + 120000) : null,
            })),
          },
        },
      });
    }
  }

  const gamesList = [...games.values()];
  const outcomes: Array<{ userId: string; won: boolean; score: number; gameIndex: number; hoursAgo: number }> = [];
  const highScores = [nova, eva, kira, max, admin, luna, dan, ivan, leo, tim, mira, sasha];
  highScores.forEach((user, userIndex) => {
    const wins = Math.max(1, 8 - Math.floor(userIndex / 2));
    for (let i = 0; i < 10; i += 1) {
      outcomes.push({
        userId: user.id,
        won: i < wins,
        score: 240 + (11 - userIndex) * 30 + Math.floor(Math.random() * 120),
        gameIndex: (userIndex + i) % gamesList.length,
        hoursAgo: 2 + i * 7 + userIndex,
      });
    }
  });
  await prisma.gameResult.createMany({
    data: outcomes.map((result, index) => {
      const game = gamesList[result.gameIndex];
      return {
        userId: result.userId,
        gameId: game.id,
        outcome: result.won ? 'WIN' : 'LOSS',
        score: result.score,
        xpEarned: result.won ? 70 : 30,
        coinsEarned: result.won ? 35 : 10,
        details: { seeded: true, game: game.slug },
        createdAt: new Date(now - result.hoursAgo * 60 * 60 * 1000),
      };
    }),
    skipDuplicates: true,
  });

  const questProgress: Record<string, { progress: number; claimed?: boolean }> = {
    'daily-play-3': { progress: 1 },
    'daily-win-1': { progress: 0 },
    'daily-post': { progress: 1 },
    'daily-likes': { progress: 3, claimed: true },
    'daily-wyr': { progress: 1 },
    'weekly-play-10': { progress: 6 },
    'weekly-friends-2': { progress: 1 },
    'weekly-quiz-2': { progress: 1 },
    'weekly-messages': { progress: 8 },
    'onboarding-profile': { progress: 1, claimed: true },
    'onboarding-game': { progress: 1, claimed: true },
    'onboarding-friend': { progress: 1, claimed: true },
    'referral-1': { progress: 0 },
  };

  for (const [code, value] of Object.entries(questProgress)) {
    const quest = questRows.get(code);
    if (!quest) continue;
    const key = quest.period === 'DAILY' ? dailyKey : quest.period === 'WEEKLY' ? weeklyKey : quest.period === 'ONBOARDING' ? 'once' : 'global';
    const completed = value.progress >= quest.target;
    await prisma.userQuest.create({
      data: {
        userId: nova.id,
        questId: quest.id,
        periodKey: key,
        progress: value.progress,
        completedAt: completed ? new Date(now - 60 * 60 * 1000) : null,
        claimedAt: value.claimed ? new Date(now - 30 * 60 * 1000) : null,
      },
    });
  }

  const unlockedCodes = ['first-game', 'first-victory', 'social-star', 'popular-creator', 'chatterbox', 'image-sleuth'];
  for (const code of unlockedCodes) {
    const achievement = achievementRows.get(code);
    if (achievement) {
      await prisma.userAchievement.create({
        data: {
          userId: nova.id,
          achievementId: achievement.id,
          unlockedAt: new Date(now - Math.random() * 20 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }
  for (const code of ['first-game', 'first-victory', 'quiz-master', 'wordsmith']) {
    const achievement = achievementRows.get(code);
    if (achievement) {
      await prisma.userAchievement.create({
        data: { userId: eva.id, achievementId: achievement.id },
      });
    }
  }

  const txData = [
    { amount: 35, type: 'GAME', description: 'Quiz Battle · победа', daysAgo: 0.2 },
    { amount: 25, type: 'QUEST', description: 'Задание: Поделитесь мыслью', daysAgo: 0.8 },
    { amount: 150, type: 'REFERRAL', description: 'Приглашён друг: Мира', daysAgo: 1.4 },
    { amount: 15, type: 'DAILY', description: 'Ежедневная награда · день 6', daysAgo: 2.1 },
    { amount: -350, type: 'SHOP', description: 'Покупка: Neon Violet', daysAgo: 3.2 },
    { amount: 70, type: 'ACHIEVEMENT', description: 'Достижение: Social Star', daysAgo: 4.1 },
    { amount: 12, type: 'GAME', description: 'Угадано изображение: Северное сияние', daysAgo: 5.3 },
    { amount: 45, type: 'QUEST', description: 'Задание: Марафонец', daysAgo: 6.4 },
    { amount: 100, type: 'BONUS', description: 'Добро пожаловать в FUNBOX', daysAgo: 12 },
  ];
  for (const [index, tx] of txData.entries()) {
    await prisma.transaction.create({
      data: {
        userId: nova.id,
        amount: tx.amount,
        type: tx.type as never,
        description: tx.description,
        reference: `seed-nova-${index}`,
        createdAt: new Date(now - tx.daysAgo * 24 * 60 * 60 * 1000),
      },
    });
  }

  await prisma.purchase.create({
    data: { userId: nova.id, itemId: (await prisma.shopItem.findUniqueOrThrow({ where: { code: 'neon-accent' } })).id, price: 350, createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000) },
  });

  await prisma.dailyClaim.create({
    data: { userId: max.id, dateKey: dateKey(), day: 4, xp: 60, coins: 30 },
  });

  await prisma.notification.createMany({
    data: [
      { userId: nova.id, type: 'FRIEND_REQUEST', title: 'Новая заявка в друзья 👥', body: 'Мира хочет добавить вас в друзья: «Привет! Играем в квиз?»', createdAt: new Date(now - 12 * 60 * 1000) },
      { userId: nova.id, type: 'REWARD', title: 'Достижение разблокировано 🏆', body: 'Social Star — у вас уже 3 друга. Награда: 80 XP и 50 FUN Coins.', createdAt: new Date(now - 2 * 60 * 60 * 1000) },
      { userId: nova.id, type: 'GAME_INVITE', title: 'Приглашение в Quiz Battle ⚡', body: 'Макс приглашает вас в комнату FUN7QX. Успейте присоединиться!', data: { code: 'FUN7QX' }, createdAt: new Date(now - 4 * 60 * 60 * 1000) },
      { userId: nova.id, type: 'SYSTEM', title: 'Ночной марафон уже сегодня 🌙', body: 'С 20:00 до 23:00 очки в Quiz Battle удваиваются. Не пропустите!', createdAt: new Date(now - 9 * 60 * 60 * 1000) },
      { userId: nova.id, type: 'DAILY', title: 'Ежедневная награда ждёт 🎁', body: 'Заберите бонус дня — серия уже 6 дней.', readAt: new Date(now - 26 * 60 * 60 * 1000), createdAt: new Date(now - 28 * 60 * 60 * 1000) },
    ],
  });

  await prisma.activityLog.createMany({
    data: [
      { userId: nova.id, action: 'game.quiz.finished', metadata: { score: 640, place: 1 }, createdAt: new Date(now - 30 * 60 * 1000) },
      { userId: nova.id, action: 'social.post.created', metadata: { postId: posts[0].id }, createdAt: new Date(now - 2 * 60 * 60 * 1000) },
      { userId: nova.id, action: 'friend.accepted', metadata: { friendId: tim.id }, createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
      { userId: nova.id, action: 'achievement.unlocked', metadata: { code: 'social-star' }, createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000) },
      { userId: nova.id, action: 'auth.telegram', createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000) },
    ],
  });

  for (const user of users.values()) {
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'auth.dev',
        createdAt: new Date(now - Math.floor(Math.random() * 6 * 24) * 60 * 60 * 1000),
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    games: await prisma.game.count(),
    questions: await prisma.gameQuestion.count(),
    achievements: await prisma.achievement.count(),
    quests: await prisma.quest.count(),
    posts: await prisma.post.count(),
    images: usedImages.size,
  };

  console.log('✅ Seed complete:', counts);
  console.log('   Demo user:  telegramId 900000001 · @nova_fun');
  console.log('   Demo admin: telegramId 900000000 · @funbox_admin');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
