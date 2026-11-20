import { z } from 'zod';

/**
 * Разрешённые источники изображений:
 *  - локальные uploads / ассеты приложения;
 *  - только HTTPS для внешних URL (Telegram WebView работает по HTTPS).
 * data:, javascript:, file: и произвольные схемы запрещены.
 */
export function isAllowedImageUrl(value: string): boolean {
  if (value.startsWith('/uploads/') || value.startsWith('/images/') || value.startsWith('/avatars/')) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isAllowedImageUrl, 'Недопустимый URL изображения');

export const optionalImageUrlSchema = imageUrlSchema.nullish();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Zod-coerce.boolean() превращает строку "false" в true, поэтому query-флаги
 * нужно разбирать явно.
 */
export const queryBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((value) => value === true || value === 'true' || value === '1');
