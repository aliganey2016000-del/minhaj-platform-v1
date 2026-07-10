/**
 * Standardized API Response Builder
 * Every API response must pass through this utility to maintain consistency.
 */
import { Response } from 'express';
export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}
export interface ApiResponseBody<T = unknown> {
    success: boolean;
    statusCode: number;
    message: string;
    data: T | null;
    meta?: PaginationMeta;
    errors: Record<string, string>[] | null;
    timestamp: string;
    requestId?: string;
}
declare class ApiResponse {
    /**
     * Send a successful response.
     */
    static success<T>(res: Response, data: T, message?: string, statusCode?: number, meta?: PaginationMeta): Response;
    /**
     * Send a created response (201).
     */
    static created<T>(res: Response, data: T, message?: string): Response;
    /**
     * Send a no-content response (204).
     */
    static noContent(res: Response, message?: string): Response;
    /**
     * Send a paginated response.
     */
    static paginated<T>(res: Response, data: T[], pagination: {
        page: number;
        limit: number;
        total: number;
    }, message?: string): Response;
    /**
     * Send an error response.
     */
    static error(res: Response, statusCode: number, message: string, errors?: Record<string, string>[]): Response;
}
export default ApiResponse;
//# sourceMappingURL=api-response.d.ts.map