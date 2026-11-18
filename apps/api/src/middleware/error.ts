import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred.';

  if (process.env.NODE_ENV !== 'test' && statusCode >= 500) {
    console.error('[Error Details]', err);
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code,
      message,
      details: err.details || null,
    },
  });
}
