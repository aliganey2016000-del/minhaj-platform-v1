"use strict";
/**
 * Standardized API Response Builder
 * Every API response must pass through this utility to maintain consistency.
 */
Object.defineProperty(exports, "__esModule", { value: true });
class ApiResponse {
    /**
     * Send a successful response.
     */
    static success(res, data, message = 'Operation completed successfully', statusCode = 200, meta) {
        const body = {
            success: true,
            statusCode,
            message,
            data,
            meta,
            errors: null,
            timestamp: new Date().toISOString(),
            requestId: res.req?.requestId,
        };
        return res.status(statusCode).json(body);
    }
    /**
     * Send a created response (201).
     */
    static created(res, data, message = 'Resource created successfully') {
        return ApiResponse.success(res, data, message, 201);
    }
    /**
     * Send a no-content response (204).
     */
    static noContent(res, message = 'Resource deleted successfully') {
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
    static paginated(res, data, pagination, message = 'Data retrieved successfully') {
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
    static error(res, statusCode, message, errors) {
        const body = {
            success: false,
            statusCode,
            message,
            data: null,
            errors: errors || null,
            timestamp: new Date().toISOString(),
            requestId: res.req?.requestId,
        };
        return res.status(statusCode).json(body);
    }
}
exports.default = ApiResponse;
//# sourceMappingURL=api-response.js.map