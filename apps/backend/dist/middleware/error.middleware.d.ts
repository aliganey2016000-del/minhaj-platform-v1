/**
 * Global Centralized Error Handler Middleware
 *
 * This must be the LAST middleware registered in the Express app.
 * It catches all errors thrown or passed via next(error) and returns a
 * standardized API response. In development mode it includes the stack trace;
 * in production it hides internal details and only exposes operational errors.
 *
 * Usage (in app.ts):
 *   // ... all routes and middleware
 *   app.use(errorHandler); // <-- LAST
 */
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error';
export declare const errorHandler: (err: Error | ApiError, req: Request, res: Response, _next: NextFunction) => void;
//# sourceMappingURL=error.middleware.d.ts.map