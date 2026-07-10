"use strict";
/**
 * Custom API Error Classes
 * Provides structured error handling across the application.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalServerError = exports.TooManyRequestsError = exports.ValidationError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.BadRequestError = exports.ApiError = void 0;
class ApiError extends Error {
    constructor(statusCode, message, errors, code, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.errors = errors;
        this.code = code;
        // Maintain proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, ApiError.prototype);
        // Captures stack trace in V8 environments (Node.js)
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.ApiError = ApiError;
class BadRequestError extends ApiError {
    constructor(message = 'Bad request', errors) {
        super(400, message, errors, 'BAD_REQUEST');
    }
}
exports.BadRequestError = BadRequestError;
class UnauthorizedError extends ApiError {
    constructor(message = 'Unauthorized — authentication required') {
        super(401, message, undefined, 'UNAUTHORIZED');
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends ApiError {
    constructor(message = 'Forbidden — insufficient permissions') {
        super(403, message, undefined, 'FORBIDDEN');
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends ApiError {
    constructor(resource = 'Resource') {
        super(404, `${resource} not found`, undefined, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends ApiError {
    constructor(message = 'Resource already exists') {
        super(409, message, undefined, 'CONFLICT');
    }
}
exports.ConflictError = ConflictError;
class ValidationError extends ApiError {
    constructor(errors) {
        super(422, 'Validation failed', errors, 'VALIDATION_ERROR');
    }
}
exports.ValidationError = ValidationError;
class TooManyRequestsError extends ApiError {
    constructor(message = 'Too many requests, please try again later') {
        super(429, message, undefined, 'RATE_LIMIT_EXCEEDED');
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
class InternalServerError extends ApiError {
    constructor(message = 'Internal server error') {
        super(500, message, undefined, 'INTERNAL_ERROR', false);
    }
}
exports.InternalServerError = InternalServerError;
//# sourceMappingURL=api-error.js.map