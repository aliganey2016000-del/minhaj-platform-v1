/**
 * Async Handler Middleware
 *
 * Wraps async route handlers to catch rejected promises and forward
 * errors to the centralized error handler. Eliminates the need for
 * repetitive try/catch blocks in controllers.
 *
 * Usage:
 *   router.get('/users', asyncHandler(userController.getAll));
 *
 * Without asyncHandler:
 *   router.get('/users', (req, res, next) => {
 *     userController.getAll(req, res).catch(next);
 *   });
 */

import { Request, Response, NextFunction } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void | Response>;

/**
 * Wraps an async Express handler so that any rejected promise is
 * passed to next(error) automatically.
 */
export const asyncHandler =
  (fn: AsyncRequestHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };