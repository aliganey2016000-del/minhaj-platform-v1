/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Restricts access to routes based on user role(s).
 * Must be placed AFTER authMiddleware in the middleware chain.
 */

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/api-error';
import { StaffAction, StaffModule } from '../utils/staff-permissions';

export type AllowedRole =
  | 'admin'
  | 'teacher'
  | 'student'
  | 'parent'
  | 'org_admin'
  | 'finance_manager'
  | 'cashier'
  | 'auditor'
  | 'staff';

export const roleMiddleware = (allowedRoles: AllowedRole[]) => {
  if (!allowedRoles || allowedRoles.length === 0) {
    throw new Error('roleMiddleware requires at least one allowedRole.');
  }

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required.');
      const userRole = req.user.role as AllowedRole;
      if (userRole === 'staff' && (req as any).staffModule) return next();
      if (!allowedRoles.includes(userRole)) {
        throw new ForbiddenError(
          `Access denied. Required role(s): ${allowedRoles.join(', ')}. Your role: ${userRole}.`
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

/** Full application administration. */
export const adminOnly = roleMiddleware(['admin', 'org_admin']);

/** Financial records can be read by finance staff and auditors. */
export const financialRead = roleMiddleware([
  'admin',
  'org_admin',
  'finance_manager',
  'cashier',
  'auditor',
]);

/** Cashiers can record/complete payments; managers retain the same ability. */
export const financialOperator = roleMiddleware([
  'admin',
  'org_admin',
  'finance_manager',
  'cashier',
]);

/** Financial configuration and irreversible controls. */
export const financialManager = roleMiddleware([
  'admin',
  'org_admin',
  'finance_manager',
]);

export const adminOrTeacher = roleMiddleware(['admin', 'org_admin', 'teacher']);
export const staffAndParents = roleMiddleware(['admin', 'teacher', 'parent']);
export const anyAuthenticatedUser = roleMiddleware([
  'admin',
  'teacher',
  'student',
  'parent',
  'org_admin',
  'finance_manager',
  'cashier',
  'auditor',
  'staff',
]);

/** Legacy roles retain their existing access; Staff must have an explicit grant. */
export const requirePermission = (module: StaffModule, action: StaffAction) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required.');
      if (req.user.role !== 'staff') return next();
      if (!req.user.permissions.includes(`${module}.${action}`)) {
        throw new ForbiddenError(`Staff permission required: ${module}.${action}`);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

/** Maps conventional REST endpoints to the action checkbox used by Staff. */
export const requireModulePermission = (module: StaffModule) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as any).staffModule = module;
    const path = req.path.toLowerCase();
    const action: StaffAction = path.includes('import')
      ? 'import'
      : path.includes('export') || path.includes('template')
        ? 'export'
        : req.method === 'GET' || req.method === 'HEAD'
          ? 'read'
          : req.method === 'POST'
            ? 'create'
            : req.method === 'DELETE'
              ? 'delete'
              : 'edit';
    requirePermission(module, action)(req, _res, next);
  };
};

export const adminOrSelf = (getResourceOwnerId: (req: Request) => string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const userRole = req.user.role as AllowedRole;
      const resourceOwnerId = getResourceOwnerId(req);
      if (userRole === 'admin' || userRole === 'teacher') return next();
      if (req.user.userId === resourceOwnerId) return next();
      throw new ForbiddenError('You do not have permission to access this resource');
    } catch (error) {
      next(error);
    }
  };
};

export const adminOrParentOf = (getChildUserId: (req: Request) => string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const userRole = req.user.role as AllowedRole;
      if (userRole === 'admin' || userRole === 'teacher') return next();
      if (userRole === 'parent' && getChildUserId(req)) return next();
      throw new ForbiddenError("You do not have permission to access this student's data");
    } catch (error) {
      next(error);
    }
  };
};

// Per-organization data isolation is enforced in utils/tenant-scope.ts.
