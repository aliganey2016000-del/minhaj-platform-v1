/**
 * JWT Utility Functions
 * Handles signing, verifying access & refresh tokens.
 */

import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './api-error';

// Fail fast at boot rather than silently signing/verifying tokens with a
// hardcoded, publicly-known-from-source secret if the env vars are ever
// missing in production (e.g. a Coolify misconfiguration) — that would let
// anyone forge valid tokens for any user/role without detection.
if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in the environment');
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

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
  const expiresIn = process.env.JWT_ACCESS_EXPIRY || '15m';

  return jwt.sign(payload, ACCESS_SECRET, { expiresIn } as jwt.SignOptions);
}

/**
 * Generate a refresh token (long-lived).
 */
export function generateRefreshToken(payload: RefreshTokenPayload): string {
  const expiresIn = process.env.JWT_REFRESH_EXPIRY || '7d';

  return jwt.sign(payload, REFRESH_SECRET, { expiresIn } as jwt.SignOptions);
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
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
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
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as jwt.JwtPayload;
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