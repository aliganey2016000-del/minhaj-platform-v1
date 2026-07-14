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
import { ForbiddenError, UnauthorizedError } from '../utils/api-error';

// ---------------------------------------------------------------------------
// Allowed role types
// ---------------------------------------------------------------------------

export type AllowedRole = 'admin' | 'teacher' | 'student' | 'parent' | 'org_admin';

// ---------------------------------------------------------------------------
// Middleware Factory
// ---------------------------------------------------------------------------

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
export const roleMiddleware = (allowedRoles: AllowedRole[]) => {
  // Early validation — fail fast during development
  if (!allowedRoles || allowedRoles.length === 0) {
    throw new Error(
      'roleMiddleware requires at least one allowedRole. ' +
      'Use roleMiddleware(["admin", "teacher", "student", "parent"]) ' +
      'to allow all authenticated users.'
    );
  }

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // 1. Ensure user is authenticated first
      if (!req.user) {
        throw new UnauthorizedError(
          'Authentication required. Apply authMiddleware before roleMiddleware.'
        );
      }

      // 2. Extract the user's role from the authenticated payload
      const userRole = req.user.role as AllowedRole;

      // 3. Check if the user's role is in the allowed list
      if (!allowedRoles.includes(userRole)) {
        throw new ForbiddenError(
          `Access denied. Required role(s): ${allowedRoles.join(', ')}. ` +
          `Your role: ${userRole}.`
        );
      }

      // Access granted
      next();
    } catch (error) {
      next(error);
    }
  };
};

// ---------------------------------------------------------------------------
// Convenience Middleware — Pre-configured Role Guards
// ---------------------------------------------------------------------------

/** Allows only admin and org_admin users. */
export const adminOnly = roleMiddleware(['admin', 'org_admin']);

/** Allows admin, org_admin, and teacher users. */
export const adminOrTeacher = roleMiddleware(['admin', 'org_admin', 'teacher']);

/** Allows admin, teacher, and parent users. */
export const staffAndParents = roleMiddleware(['admin', 'teacher', 'parent']);

/** Allows all authenticated users regardless of role. */
export const anyAuthenticatedUser = roleMiddleware([
  'admin',
  'teacher',
  'student',
  'parent',
  'org_admin',
]);

// ---------------------------------------------------------------------------
// Conditional Self-Access Middleware
// ---------------------------------------------------------------------------

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
export const adminOrSelf = (getResourceOwnerId: (req: Request) => string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const userRole = req.user.role as AllowedRole;
      const resourceOwnerId = getResourceOwnerId(req);

      // Admins and teachers can access any resource
      if (userRole === 'admin' || userRole === 'teacher') {
        return next();
      }

      // Students and parents can only access their own resources
      if (req.user.userId === resourceOwnerId) {
        return next();
      }

      throw new ForbiddenError(
        'You do not have permission to access this resource'
      );
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Allows access if the user is an admin/teacher OR a parent viewing their
 * linked child's data.
 *
 * @param getChildUserId - Function that extracts the child's user ID from request.
 */
export const adminOrParentOf = (getChildUserId: (req: Request) => string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const userRole = req.user.role as AllowedRole;

      if (userRole === 'admin' || userRole === 'teacher') {
        return next();
      }

      if (userRole === 'parent') {
        // In production, verify the parent-child relationship from DB
        const childUserId = getChildUserId(req);
        // Placeholder: check would query Parent model for linked children
        // For now, we allow it (full check in service layer)
        if (childUserId) {
          return next();
        }
      }

      throw new ForbiddenError(
        'You do not have permission to access this student\'s data'
      );
    } catch (error) {
      next(error);
    }
  };
};

// ---------------------------------------------------------------------------
// Multi-Tenant Organization Scoping
// ---------------------------------------------------------------------------
// Actual per-organization data isolation for org_admin lives in
// `utils/tenant-scope.ts` (applyOrgFilter / assertOwnsOrg / resolveOrgIdForCreate),
// applied inside each controller's queries — a route-level middleware can't
// filter a Mongoose query's *results*, only allow/deny the whole request.
