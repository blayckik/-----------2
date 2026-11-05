import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const userCardSelect = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  avatarUrl: true,
  level: true,
  xp: true,
  role: true,
  createdAt: true,
  lastActiveAt: true,
  profile: { select: { displayName: true, bio: true, accentColor: true, bannerUrl: true } },
  stats: {
    select: {
      gamesPlayed: true,
      gamesWon: true,
      friendsCount: true,
      postsCount: true,
      quizWins: true,
      loginStreak: true,
    },
  },
} satisfies Prisma.UserSelect;

export async function blockedUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.flatMap((row) => [row.blockerId, row.blockedId]))].filter(
    (id) => id !== userId,
  );
}

export async function friendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true },
  });
  return rows.map((row) => (row.userAId === userId ? row.userBId : row.userAId));
}

export function publicUser(user: {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  level?: number;
  profile?: { displayName: string | null; accentColor?: string } | null;
}) {
  return {
    id: user.id,
    name: user.profile?.displayName || [user.firstName, user.lastName].filter(Boolean).join(' '),
    username: user.username,
    avatarUrl: user.avatarUrl,
    level: user.level ?? 1,
    accentColor: user.profile?.accentColor ?? '#8b5cf6',
  };
}
