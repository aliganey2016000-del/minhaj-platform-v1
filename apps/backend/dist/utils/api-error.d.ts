/**
 * Custom API Error Classes
 * Provides structured error handling across the application.
 */
export declare class ApiError extends Error {
    readonly statusCode: number;
    readonly isOperational: boolean;
    readonly errors?: Record<string, string>[];
    readonly code?: string;
    constructor(statusCode: number, message: string, errors?: Record<string, string>[], code?: string, isOperational?: boolean);
}
export declare class BadRequestError extends ApiError {
    constructor(message?: string, errors?: Record<string, string>[]);
}
export declare class UnauthorizedError extends ApiError {
    constructor(message?: string);
}
export declare class ForbiddenError extends ApiError {
    constructor(message?: string);
}
export declare class NotFoundError extends ApiError {
    constructor(resource?: string);
}
export declare class ConflictError extends ApiError {
    constructor(message?: string);
}
export declare class ValidationError extends ApiError {
    constructor(errors: Record<string, string>[]);
}
export declare class TooManyRequestsError extends ApiError {
    constructor(message?: string);
}
export declare class InternalServerError extends ApiError {
    constructor(message?: string);
}
//# sourceMappingURL=api-error.d.ts.map