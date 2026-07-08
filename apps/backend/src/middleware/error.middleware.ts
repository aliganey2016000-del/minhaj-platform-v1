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
import ApiResponse from '../utils/api-response';

// ---------------------------------------------------------------------------
// Interface for Mongoose validation errors (optional, for better typing)
// ---------------------------------------------------------------------------

interface MongooseValidationError extends Error {
  name: 'ValidationError';
  errors: Record<string, { message: string; path: string }>;
}

interface MongooseCastError extends Error {
  name: 'CastError';
  path: string;
  value: unknown;
}

interface MongoDuplicateKeyError extends Error {
  code: 11000;
  keyValue: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Error Handler
// ---------------------------------------------------------------------------

export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // --------------------------------------
  // 1. Determine if this is an operational error (our ApiError)
  // --------------------------------------
  if (err instanceof ApiError) {
    return void ApiResponse.error(
      res,
      err.statusCode,
      err.message,
      err.errors
    );
  }

  // --------------------------------------
  // 2. Handle Mongoose Validation Errors
  // --------------------------------------
  if (err.name === 'ValidationError') {
    const validationErr = err as MongooseValidationError;
    const errors = Object.values(validationErr.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));

    return void ApiResponse.error(
      res,
      422,
      'Validation failed — please check your input',
      errors
    );
  }

  // --------------------------------------
  // 3. Handle Mongoose CastError (invalid ObjectId etc.)
  // --------------------------------------
  if (err.name === 'CastError') {
    const castErr = err as MongooseCastError;
    return void ApiResponse.error(
      res,
      400,
      `Invalid value for field "${castErr.path}": "${castErr.value}"`
    );
  }

  // --------------------------------------
  // 4. Handle MongoDB Duplicate Key Error (code 11000)
  // --------------------------------------
  if ((err as any).code === 11000) {
    const dupErr = err as MongoDuplicateKeyError;
    const fields = Object.keys(dupErr.keyValue).join(', ');
    return void ApiResponse.error(
      res,
      409,
      `Duplicate value for field(s): ${fields}. This resource already exists.`
    );
  }

  // --------------------------------------
  // 5. Handle JWT Errors (from express-jwt or jsonwebtoken)
  // --------------------------------------
  if (err.name === 'UnauthorizedError') {
    return void ApiResponse.error(res, 401, 'Invalid or expired token');
  }

  if (err.name === 'JsonWebTokenError') {
    return void ApiResponse.error(res, 401, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return void ApiResponse.error(res, 401, 'Token has expired');
  }

  // --------------------------------------
  // 6. Handle SyntaxError (malformed JSON in request body)
  // --------------------------------------
  if (err instanceof SyntaxError && 'body' in err) {
    return void ApiResponse.error(
      res,
      400,
      'Invalid JSON in request body'
    );
  }

  // --------------------------------------
  // 7. Development: Log full error + return stack trace
  // --------------------------------------
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('💥 UNHANDLED ERROR');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('  Name:   ', err.name);
    console.error('  Message:', err.message);
    console.error('  Stack:  ', err.stack);
    console.error('  Path:   ', req.method, req.originalUrl);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return void ApiResponse.error(
      res,
      500,
      isProduction
        ? 'Internal server error'
        : `${err.name}: ${err.message}`
    );
  }

  // --------------------------------------
  // 8. Production: Hide internal details, log safely
  // --------------------------------------
  // In production, you would send the error to a monitoring service (e.g. Sentry)
  // Sentry.captureException(err);

  console.error(`[${new Date().toISOString()}] ERROR:`, {
    name: err.name,
    message: err.message,
    path: req.originalUrl,
    method: req.method,
  });

  return void ApiResponse.error(
    res,
    500,
    'An unexpected error occurred. Please try again later or contact support.'
  );
};