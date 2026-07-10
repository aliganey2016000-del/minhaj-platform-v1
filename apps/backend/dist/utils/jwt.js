"use strict";
/**
 * JWT Utility Functions
 * Handles signing, verifying access & refresh tokens.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.generateTokenPair = generateTokenPair;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const api_error_1 = require("./api-error");
/**
 * Generate an access token (short-lived).
 */
function generateAccessToken(payload) {
    const secret = process.env.JWT_ACCESS_SECRET || 'fallback-access-secret-dev';
    const expiresIn = process.env.JWT_ACCESS_EXPIRY || '15m';
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn });
}
/**
 * Generate a refresh token (long-lived).
 */
function generateRefreshToken(payload) {
    const secret = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-dev';
    const expiresIn = process.env.JWT_REFRESH_EXPIRY || '7d';
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn });
}
/**
 * Generate both access and refresh tokens.
 */
function generateTokenPair(accessPayload, refreshPayload) {
    return {
        accessToken: generateAccessToken(accessPayload),
        refreshToken: generateRefreshToken(refreshPayload),
    };
}
/**
 * Verify and decode an access token. Throws if invalid or expired.
 */
function verifyAccessToken(token) {
    const secret = process.env.JWT_ACCESS_SECRET || 'fallback-access-secret-dev';
    try {
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        return {
            userId: decoded.userId,
            role: decoded.role,
            permissions: decoded.permissions || [],
        };
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new api_error_1.UnauthorizedError('Access token has expired');
        }
        if (error.name === 'JsonWebTokenError') {
            throw new api_error_1.UnauthorizedError('Invalid access token');
        }
        throw new api_error_1.UnauthorizedError('Token verification failed');
    }
}
/**
 * Verify and decode a refresh token. Throws if invalid or expired.
 */
function verifyRefreshToken(token) {
    const secret = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-dev';
    try {
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        return {
            userId: decoded.userId,
            tokenVersion: decoded.tokenVersion,
        };
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new api_error_1.UnauthorizedError('Refresh token has expired');
        }
        if (error.name === 'JsonWebTokenError') {
            throw new api_error_1.UnauthorizedError('Invalid refresh token');
        }
        throw new api_error_1.UnauthorizedError('Token verification failed');
    }
}
//# sourceMappingURL=jwt.js.map