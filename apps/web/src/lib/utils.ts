import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LevelProgress, UserCard } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

export function formatCompact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0).replace('.0', '')}K`;
  return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function timeAgo(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'только что';
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')} назад`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`;
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function userName(user?: UserCard | null): string {
  if (!user) return 'Игрок';
  return (
    user.profile?.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.username ||
    'Игрок'
  );
}

export function initials(user?: UserCard | null): string {
  const name = userName(user);
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function levelFromXp(xp: number): LevelProgress {
  const level = Math.min(100, Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1));
  const start = (level - 1) ** 2 * 50;
  const end = level >= 100 ? start + 1 : level ** 2 * 50;
  const current = Math.max(0, xp - start);
  const needed = Math.max(1, end - start);
  return { level, current, needed, percent: Math.min(100, Math.round((current / needed) * 100)) };
}

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const rarityColor: Record<string, string> = {
  COMMON: '#94a3b8',
  RARE: '#38bdf8',
  EPIC: '#a78bfa',
  LEGENDARY: '#fbbf24',
};

export const rarityLabel: Record<string, string> = {
  COMMON: 'Обычное',
  RARE: 'Редкое',
  EPIC: 'Эпическое',
  LEGENDARY: 'Легендарное',
};

export const transactionIcon: Record<string, string> = {
  QUEST: '🎯',
  ACHIEVEMENT: '🏆',
  DAILY: '🎁',
  GAME: '🎮',
  REFERRAL: '🤝',
  SHOP: '🛍️',
  ADMIN: '⚙️',
  BONUS: '✨',
  PENALTY: '⚠️',
  LEVEL: '⭐',
};
