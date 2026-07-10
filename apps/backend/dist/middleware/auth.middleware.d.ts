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
declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
                role: string;
                permissions: string[];
            };
        }
    }
}
export declare const authMiddleware: (req: Request, _res: Response, next: NextFunction) => void;
/**
 * Verifies authentication AND that user's email is verified.
 * Place AFTER authMiddleware in the chain.
 */
export declare const requireVerifiedEmail: (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.middleware.d.ts.map