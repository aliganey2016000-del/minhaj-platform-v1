/**
 * JWT Utility Functions
 * Handles signing, verifying access & refresh tokens.
 */
interface AccessTokenPayload {
    userId: string;
    role: string;
    permissions: string[];
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
export declare function generateAccessToken(payload: AccessTokenPayload): string;
/**
 * Generate a refresh token (long-lived).
 */
export declare function generateRefreshToken(payload: RefreshTokenPayload): string;
/**
 * Generate both access and refresh tokens.
 */
export declare function generateTokenPair(accessPayload: AccessTokenPayload, refreshPayload: RefreshTokenPayload): TokenPair;
/**
 * Verify and decode an access token. Throws if invalid or expired.
 */
export declare function verifyAccessToken(token: string): AccessTokenPayload;
/**
 * Verify and decode a refresh token. Throws if invalid or expired.
 */
export declare function verifyRefreshToken(token: string): RefreshTokenPayload;
export {};
//# sourceMappingURL=jwt.d.ts.map