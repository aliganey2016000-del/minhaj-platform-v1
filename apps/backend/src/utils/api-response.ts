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

class ApiResponse {
  /**
   * Send a successful response.
   */
  static success<T>(
    res: Response,
    data: T,
    message = 'Operation completed successfully',
    statusCode = 200,
    meta?: PaginationMeta
  ): Response {
    const body: ApiResponseBody<T> = {
      success: true,
      statusCode,
      message,
      data,
      meta,
      errors: null,
      timestamp: new Date().toISOString(),
      requestId: (res.req as any)?.requestId,
    };
    return res.status(statusCode).json(body);
  }

  /**
   * Send a created response (201).
   */
  static created<T>(
    res: Response,
    data: T,
    message = 'Resource created successfully'
  ): Response {
    return ApiResponse.success(res, data, message, 201);
  }

  /**
   * Send a no-content response (204).
   */
  static noContent(res: Response, message = 'Resource deleted successfully'): Response {
    return res.status(204).json({
      success: true,
      statusCode: 204,
      message,
      data: null,
      meta: undefined,
      errors: null,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a paginated response.
   */
  static paginated<T>(
    res: Response,
    data: T[],
    pagination: { page: number; limit: number; total: number },
    message = 'Data retrieved successfully'
  ): Response {
    const { page, limit, total } = pagination;
    const totalPages = Math.ceil(total / limit);

    return ApiResponse.success(res, data, message, 200, {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    });
  }

  /**
   * Send an error response.
   */
  static error(
    res: Response,
    statusCode: number,
    message: string,
    errors?: Record<string, string>[]
  ): Response {
    const body: ApiResponseBody<null> = {
      success: false,
      statusCode,
      message,
      data: null,
      errors: errors || null,
      timestamp: new Date().toISOString(),
      requestId: (res.req as any)?.requestId,
    };
    return res.status(statusCode).json(body);
  }
}

export default ApiResponse;