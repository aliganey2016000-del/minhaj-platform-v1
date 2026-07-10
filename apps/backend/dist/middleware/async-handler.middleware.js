"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
/**
 * Wraps an async Express handler so that any rejected promise is
 * passed to next(error) automatically.
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=async-handler.middleware.js.map