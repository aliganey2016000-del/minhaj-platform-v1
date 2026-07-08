/**
 * Custom API Error Classes
 * Provides structured error handling across the application.
 */

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: Record<string, string>[];
  public readonly code?: string;

  constructor(
    statusCode: number,
    message: string,
    errors?: Record<string, string>[],
    code?: string,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    this.code = code;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);

    // Captures stack trace in V8 environments (Node.js)
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', errors?: Record<string, string>[]) {
    super(400, message, errors, 'BAD_REQUEST');
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized — authentication required') {
    super(401, message, undefined, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden — insufficient permissions') {
    super(403, message, undefined, 'FORBIDDEN');
  }
}

export class NotFoundError extends ApiError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, undefined, 'NOT_FOUND');
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource already exists') {
    super(409, message, undefined, 'CONFLICT');
  }
}

export class ValidationError extends ApiError {
  constructor(errors: Record<string, string>[]) {
    super(422, 'Validation failed', errors, 'VALIDATION_ERROR');
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests, please try again later') {
    super(429, message, undefined, 'RATE_LIMIT_EXCEEDED');
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error') {
    super(500, message, undefined, 'INTERNAL_ERROR', false);
  }
}