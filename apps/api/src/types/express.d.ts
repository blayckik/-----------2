import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        id: string;
        role: Role;
        telegramId: string;
        username: string | null;
        isBanned: boolean;
      };
    }
  }
}

export {};
