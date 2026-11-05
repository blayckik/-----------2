import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, 'BAD_REQUEST', details);
export const unauthorized = (message = 'Требуется авторизация') =>
  new HttpError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'Недостаточно прав') =>
  new HttpError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Не найдено') => new HttpError(404, message, 'NOT_FOUND');
export const conflict = (message: string) => new HttpError(409, message, 'CONFLICT');

export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data });
}

export function fail(res: Response, status: number, message: string, code = 'ERROR', details?: unknown) {
  return res.status(status).json({ error: { code, message, details } });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return fail(res, 400, 'Проверьте правильность данных', 'VALIDATION_ERROR', error.flatten());
  }

  if (error instanceof HttpError) {
    return fail(res, error.status, error.message, error.code, error.details);
  }

  if (typeof error === 'object' && error && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    if (code === 'P2002') {
      return fail(res, 409, 'Это действие уже выполнено', 'DUPLICATE');
    }
    if (code === 'P2025') {
      return fail(res, 404, 'Запись не найдена', 'NOT_FOUND');
    }
    if (code === 'P2003') {
      return fail(res, 409, 'Связанная запись не существует', 'RELATION_ERROR');
    }
  }

  if (error instanceof Error && error.name === 'MulterError') {
    return fail(res, 400, 'Файл не принят', 'UPLOAD_ERROR', error.message);
  }

  console.error('[unhandled]', error);
  return fail(res, 500, 'Внутренняя ошибка сервера', 'INTERNAL_ERROR');
}
