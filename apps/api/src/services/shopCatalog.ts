import { prisma } from '../lib/prisma.js';

const EXCLUSIVE_ITEMS = [
  {
    code: 'exclusive-aurora-frame',
    name: 'Aurora Frame',
    description: 'Эксклюзивная переливающаяся рамка профиля',
    icon: '🌌',
    type: 'AVATAR' as const,
    price: 2400,
    rarity: 'LEGENDARY' as const,
    payload: { frame: 'aurora' },
    sortOrder: 20,
  },
  {
    code: 'exclusive-inferno-frame',
    name: 'Inferno Frame',
    description: 'Огненная рамка для тех, кто не боится выделяться',
    icon: '🔥',
    type: 'AVATAR' as const,
    price: 3200,
    rarity: 'LEGENDARY' as const,
    payload: { frame: 'inferno' },
    sortOrder: 21,
  },
  {
    code: 'exclusive-star-crown',
    name: 'Star Crown',
    description: 'Звездная корона рядом с аватаром',
    icon: '👑',
    type: 'BADGE' as const,
    price: 1800,
    rarity: 'LEGENDARY' as const,
    payload: { badge: 'star-crown' },
    sortOrder: 22,
  },
  {
    code: 'exclusive-nightfall',
    name: 'NIGHTFALL',
    description: 'Эксклюзивный титул для профиля',
    icon: '🌠',
    type: 'TITLE' as const,
    price: 2200,
    rarity: 'LEGENDARY' as const,
    payload: { title: 'NIGHTFALL' },
    sortOrder: 23,
  },
  {
    code: 'exclusive-midnight',
    name: 'Midnight Accent',
    description: 'Глубокий ночной акцент интерфейса',
    icon: '🌑',
    type: 'THEME' as const,
    price: 1600,
    rarity: 'EPIC' as const,
    payload: { accentColor: '#6366f1' },
    sortOrder: 24,
  },
];

export async function ensureShopCatalog() {
  for (const item of EXCLUSIVE_ITEMS) {
    await prisma.shopItem.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        description: item.description,
        icon: item.icon,
        type: item.type,
        price: item.price,
        rarity: item.rarity,
        payload: item.payload,
        sortOrder: item.sortOrder,
        isActive: true,
      },
      create: {
        ...item,
        isActive: true,
      },
    });
  }
}
