/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Restricts access to routes based on user role(s).
 * Must be placed AFTER authMiddleware in the middleware chain.
 *
 * Usage:
 *   router.get('/admin', authMiddleware, roleMiddleware(['admin']), handler);
 *   router.get('/shared', authMiddleware, roleMiddleware(['admin', 'teacher']), handler);
 */
import { Request, Response, NextFunction } from 'express';
export type AllowedRole = 'admin' | 'teacher' | 'student' | 'parent';
/**
 * Returns a middleware function that checks whether the authenticated user's
 * role is included in the allowed roles list.
 *
 * @param allowedRoles - One or more roles permitted to access the route.
 * @returns Express middleware function.
 *
 * @example
 *   // Only admins
 *   roleMiddleware(['admin'])
 *
 * @example
 *   // Admins OR teachers
 *   roleMiddleware(['admin', 'teacher'])
 *
 * @example
 *   // All authenticated users (any role)
 *   roleMiddleware(['admin', 'teacher', 'student', 'parent'])
 */
export declare const roleMiddleware: (allowedRoles: AllowedRole[]) => (req: Request, _res: Response, next: NextFunction) => void;
/** Allows only admin users. */
export declare const adminOnly: (req: Request, _res: Response, next: NextFunction) => void;
/** Allows admin and teacher users. */
export declare const adminOrTeacher: (req: Request, _res: Response, next: NextFunction) => void;
/** Allows admin, teacher, and parent users. */
export declare const staffAndParents: (req: Request, _res: Response, next: NextFunction) => void;
/** Allows all authenticated users regardless of role. */
export declare const anyAuthenticatedUser: (req: Request, _res: Response, next: NextFunction) => void;
/**
 * Allows access if the user is an admin/teacher OR if they are accessing their
 * own resource (e.g., a student viewing their own profile).
 *
 * Must be placed AFTER authMiddleware.
 *
 * @param getResourceOwnerId - Function that extracts the owner ID from request params.
 *
 * @example
 *   // Student can view own profile, admin/teacher can view any
 *   router.get('/students/:id',
 *     authMiddleware,
 *     adminOrSelf((req) => req.params.id)
 *   );
 */
export declare const adminOrSelf: (getResourceOwnerId: (req: Request) => string) => (req: Request, _res: Response, next: NextFunction) => void;
/**
 * Allows access if the user is an admin/teacher OR a parent viewing their
 * linked child's data.
 *
 * @param getChildUserId - Function that extracts the child's user ID from request.
 */
export declare const adminOrParentOf: (getChildUserId: (req: Request) => string) => (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=role.middleware.d.ts.map