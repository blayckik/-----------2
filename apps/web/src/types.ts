export type Role = 'USER' | 'MODERATOR' | 'ADMIN';

export interface Profile {
  displayName: string | null;
  bio: string | null;
  accentColor: string;
  bannerUrl: string | null;
  country?: string | null;
  hideFriends: boolean;
  hideActivity: boolean;
  allowStrangersMessages: boolean;
  allowGameInvites: boolean;
  profileCompleted: boolean;
}

export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  quizWins: number;
  friendsCount: number;
  postsCount: number;
  commentsCount: number;
  likesReceived: number;
  messagesSent: number;
  wordsSubmitted: number;
  imagesGuessed: number;
  wyrVotes: number;
  loginStreak: number;
  bestLoginStreak: number;
  xpEarned: number;
  coinsEarned: number;
}

export interface UserCard {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  level: number;
  xp?: number;
  coins?: number;
  role?: Role;
  isBanned?: boolean;
  profile?: Profile | null;
  stats?: Partial<UserStats> | null;
  lastActiveAt?: string;
  createdAt?: string;
}

export interface Me extends UserCard {
  telegramId: string;
  coins: number;
  level: number;
  xp: number;
  profile: Profile;
  stats: UserStats;
  settings: {
    theme: 'dark' | 'light' | 'system';
    language: string;
    notifyFriends: boolean;
    notifyMessages: boolean;
    notifyAchievements: boolean;
    notifyDaily: boolean;
    notifyGameInvites: boolean;
    soundEnabled: boolean;
  };
  wallet: { totalEarned: number; totalSpent: number } | null;
  _count: { achievements: number; posts: number; notifications: number };
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  gradient: string;
  activeRooms?: number;
  activePlayers?: number;
  playedByMe?: number;
}

export interface Quest {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  period: 'ONBOARDING' | 'DAILY' | 'WEEKLY' | 'SPECIAL';
  metric: string;
  target: number;
  xpReward: number;
  coinReward: number;
}

export interface UserQuest {
  id: string;
  progress: number;
  completedAt: string | null;
  claimedAt: string | null;
  quest: Quest;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  icon: string;
  gradient: string;
  rewardXp: number;
  rewardCoins: number;
  startsAt: string;
  endsAt: string;
}

export interface LevelProgress {
  level: number;
  current: number;
  needed: number;
  percent: number;
}

export interface Dashboard {
  user: Me;
  level: LevelProgress;
  dailyQuests: UserQuest[];
  weeklyQuests: UserQuest[];
  events: Event[];
  popularGames: Game[];
  topPlayers: UserCard[];
  recommendations: UserCard[];
  unreadNotifications: number;
  dailyAvailable: boolean;
  dailyDay: number;
  recentResults: GameResult[];
  friendsCount: number;
  onlineNow: number;
}

export interface PostAuthor extends UserCard {}

export interface Post {
  id: string;
  authorId: string;
  author: PostAuthor;
  content: string;
  imageUrl: string | null;
  categoryId: string | null;
  category?: { id: string; name: string; slug: string; icon?: string | null } | null;
  repostOfId: string | null;
  repostOf?: Post | null;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  createdAt: string;
  likedByMe: boolean;
  _count: { comments: number; likes: number; reposts?: number };
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: UserCard;
}

export interface Conversation {
  id: string;
  title: string;
  avatarUrl: string | null;
  participants: UserCard[];
  lastMessage: Message | null;
  unreadCount: number;
  lastMessageAt: string;
  isMuted: boolean;
  lastReadAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'STICKER' | 'SYSTEM';
  imageUrl: string | null;
  createdAt: string;
  sender?: UserCard;
  receipts?: Array<{ userId: string; readAt: string | null }>;
}

export interface GameResult {
  id: string;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  score: number;
  xpEarned: number;
  coinsEarned: number;
  createdAt: string;
  details?: Record<string, unknown>;
  game?: Game | null;
  room?: {
    game?: Game;
    participants?: Array<{ user?: UserCard; score: number; rank: number | null; isBot: boolean }>;
  } | null;
}

export interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  metric: string | null;
  threshold: number;
  xpReward: number;
  coinReward: number;
  unlocked?: boolean;
  unlockedAt?: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  value: number;
  extra: number;
  user: UserCard;
}

export interface WalletData {
  balance: number;
  xp: number;
  level: number;
  wallet: { totalEarned: number; totalSpent: number } | null;
  transactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string;
    createdAt: string;
  }>;
  purchases: Array<{ id: string; item: ShopItem; createdAt: string }>;
  daily: {
    available: boolean;
    day: number;
    lastClaim: { day: number; xp: number; coins: number; createdAt: string } | null;
    potential: { xp: number; coins: number };
  };
  stats: UserStats | null;
}

export interface ShopItem {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  type: string;
  price: number;
  rarity: string;
  owned?: boolean;
}

export interface Character {
  id: string;
  participantId?: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  isBot: boolean;
  score: number;
  correct?: number;
  words?: Array<{ word: string; points: number; at: number }>;
}

export interface QuizRoom {
  id: string;
  code: string;
  hostId: string;
  status: string;
  categoryId: string | null;
  phase?: string;
  totalQuestions?: number;
  isPrivate?: boolean;
  maxPlayers?: number;
  settings?: { questionCount?: number; autoStart?: boolean };
  participants: Character[];
}

export interface QuizQuestion {
  questionIndex: number;
  totalQuestions: number;
  prompt: string;
  options: string[];
  hint: string | null;
  mediaUrl: string | null;
  difficulty: string;
  durationMs: number;
  endsAt: string;
}

export interface DuelState {
  id: string;
  code: string;
  hostId: string;
  letters: string[];
  startsAt: string;
  endsAt: string;
  members: Character[];
}
