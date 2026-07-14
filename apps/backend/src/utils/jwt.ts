/**
 * JWT Utility Functions
 * Handles signing, verifying access & refresh tokens.
 */

import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './api-error';

interface AccessTokenPayload {
  userId: string;
  role: string;
  permissions: string[];
  organizationId?: string;
}

interface RefreshTokenPayload {
  userId: string;
  tokenVersion: number;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate an access token (short-lived).
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  const secret = process.env.JWT_ACCESS_SECRET || 'fallback-access-secret-dev';
  const expiresIn = process.env.JWT_ACCESS_EXPIRY || '15m';

  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

/**
 * Generate a refresh token (long-lived).
 */
export function generateRefreshToken(payload: RefreshTokenPayload): string {
  const secret = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-dev';
  const expiresIn = process.env.JWT_REFRESH_EXPIRY || '7d';

  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

/**
 * Generate both access and refresh tokens.
 */
export function generateTokenPair(
  accessPayload: AccessTokenPayload,
  refreshPayload: RefreshTokenPayload
): TokenPair {
  return {
    accessToken: generateAccessToken(accessPayload),
    refreshToken: generateRefreshToken(refreshPayload),
  };
}

/**
 * Verify and decode an access token. Throws if invalid or expired.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = process.env.JWT_ACCESS_SECRET || 'fallback-access-secret-dev';

  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    return {
      userId: decoded.userId as string,
      role: decoded.role as string,
      permissions: (decoded.permissions as string[]) || [],
      organizationId: decoded.organizationId as string | undefined,
    };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Access token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new UnauthorizedError('Invalid access token');
    }
    throw new UnauthorizedError('Token verification failed');
  }
}

/**
 * Verify and decode a refresh token. Throws if invalid or expired.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const secret = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-dev';

  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    return {
      userId: decoded.userId as string,
      tokenVersion: decoded.tokenVersion as number,
    };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Refresh token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new UnauthorizedError('Invalid refresh token');
    }
    throw new UnauthorizedError('Token verification failed');
  }
}