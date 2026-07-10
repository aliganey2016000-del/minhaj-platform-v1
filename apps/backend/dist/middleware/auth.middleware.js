"use strict";
/**
 * Authentication Middleware
 *
 * Verifies the JWT access token from the Authorization header.
 * Extracts the user payload ({ userId, role, permissions }) and attaches it
 * to `req.user`. Rejects expired, malformed, or missing tokens.
 *
 * Usage:
 *   router.get('/protected', authMiddleware, controller.handler);
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireVerifiedEmail = exports.authMiddleware = void 0;
const api_error_1 = require("../utils/api-error");
const jwt_1 = require("../utils/jwt");
// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
const authMiddleware = (req, _res, next) => {
    try {
        // 1. Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            throw new api_error_1.UnauthorizedError('Authorization header is missing');
        }
        // Expected format: "Bearer <token>"
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            throw new api_error_1.UnauthorizedError('Authorization header must use Bearer scheme: "Bearer <token>"');
        }
        const token = parts[1];
        if (!token || token === 'null' || token === 'undefined') {
            throw new api_error_1.UnauthorizedError('Access token is missing');
        }
        // 2. Verify and decode the access token
        const decoded = (0, jwt_1.verifyAccessToken)(token);
        // 3. Attach decoded payload to request object
        req.user = {
            userId: decoded.userId,
            role: decoded.role,
            permissions: decoded.permissions,
        };
        next();
    }
    catch (error) {
        // If the error is already an ApiError (from verifyAccessToken), pass it through
        if (error instanceof api_error_1.UnauthorizedError) {
            return next(error);
        }
        // Otherwise wrap unexpected errors
        next(new api_error_1.UnauthorizedError('Authentication failed'));
    }
};
exports.authMiddleware = authMiddleware;
// ---------------------------------------------------------------------------
// Optional: Strict auth that requires email verification
// ---------------------------------------------------------------------------
/**
 * Verifies authentication AND that user's email is verified.
 * Place AFTER authMiddleware in the chain.
 */
const requireVerifiedEmail = (req, _res, next) => {
    // In a full implementation this would check user.isVerified from DB
    // For now, it passes through since the user payload doesn't include isVerified
    // You would attach isVerified to the JWT payload in production
    if (!req.user) {
        return next(new api_error_1.UnauthorizedError('Authentication required'));
    }
    next();
};
exports.requireVerifiedEmail = requireVerifiedEmail;
//# sourceMappingURL=auth.middleware.js.map