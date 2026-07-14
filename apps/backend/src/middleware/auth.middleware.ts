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

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/api-error';
import { verifyAccessToken } from '../utils/jwt';

// ---------------------------------------------------------------------------
// Augment Express Request to include authenticated user payload
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        permissions: string[];
        organizationId?: string;
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export const authMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('Authorization header is missing');
    }

    // Expected format: "Bearer <token>"
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedError(
        'Authorization header must use Bearer scheme: "Bearer <token>"'
      );
    }

    const token = parts[1];

    if (!token || token === 'null' || token === 'undefined') {
      throw new UnauthorizedError('Access token is missing');
    }

    // 2. Verify and decode the access token
    const decoded = verifyAccessToken(token);

    // 3. Attach decoded payload to request object
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      permissions: decoded.permissions,
      organizationId: decoded.organizationId,
    };

    next();
  } catch (error) {
    // If the error is already an ApiError (from verifyAccessToken), pass it through
    if (error instanceof UnauthorizedError) {
      return next(error);
    }

    // Otherwise wrap unexpected errors
    next(new UnauthorizedError('Authentication failed'));
  }
};

// ---------------------------------------------------------------------------
// Optional: Strict auth that requires email verification
// ---------------------------------------------------------------------------

/**
 * Verifies authentication AND that user's email is verified.
 * Place AFTER authMiddleware in the chain.
 */
export const requireVerifiedEmail = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // In a full implementation this would check user.isVerified from DB
  // For now, it passes through since the user payload doesn't include isVerified
  // You would attach isVerified to the JWT payload in production
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }
  next();
};