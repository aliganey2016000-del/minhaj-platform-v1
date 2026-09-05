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
      const page = (req as any).staffPage as string | undefined;
      if (req.user.permissions.includes(`${module}.${action}`) || (page && req.user.permissions.includes(`page:${page}.${action}`))) {
        return next();
      }
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
    const path = `${req.baseUrl}${req.path}`.toLowerCase();
    const page = path.includes('/students/report')
      ? 'admin/students/report'
      : path.includes('/students')
        ? 'admin/students'
      : path.includes('/activity')
        ? 'admin/activity'
        : path.includes('/courses/') && path.includes('/builder')
          ? 'admin/courses/builder'
          : path.includes('/courses/') && path.includes('/gradebook')
            ? 'admin/courses/gradebook'
            : path.includes('/courses/') && path.includes('/gate-report')
              ? 'admin/courses/gate-report'
              : path.includes('/courses/') && path.includes('/lessons/')
                ? 'admin/courses/lesson-edit'
                : path.includes('/courses/') && path.includes('/quizzes/')
                  ? 'admin/courses/quiz-edit'
                  : path.includes('/courses/') && path.includes('/exams/')
                    ? 'admin/courses/exam-paper-edit'
                    : path.includes('/courses/') && path.includes('/preview')
                      ? 'admin/courses/preview'
                      : path.includes('/fee-structures')
        ? 'admin/payments/fee-structures'
        : path.includes('/invoices')
          ? 'admin/payments/invoices'
          : path.includes('/discount-grants')
            ? 'admin/payments/discounts'
            : path.includes('/payments') || path.includes('/refunds') || path.includes('/cash-sessions') || path.includes('/finance')
              ? 'admin/payments'
              : path.includes('/exams/') && path.includes('/paper/review')
                ? 'admin/exams/paper-review'
                : path.includes('/exam-rooms')
                ? 'admin/exams/rooms'
                : path.includes('/exam-incidents')
                  ? 'admin/exams/compliance'
                  : path.includes('/exams')
                    ? 'admin/exams'
                    : path.includes('/results')
                      ? 'admin/results'
                      : path.includes('/certificates')
                        ? 'admin/certificates'
                        : path.includes('/courses')
                          ? 'admin/courses'
                          : path.includes('/parents')
                            ? 'admin/parents'
                            : path.includes('/teachers')
                              ? 'admin/teachers'
                              : path.includes('/staff')
                                ? 'admin/staff'
                                : path.includes('/schools')
                                  ? 'admin/schools'
                                  : path.includes('/users/permissions')
                                    ? 'admin/roles'
                                    : path.includes('/users')
                                      ? 'admin/users'
                                    : path.includes('/classes')
                                      ? 'admin/classes'
                                      : path.includes('/payments/balances/')
                                        ? 'admin/payments/balances/detail'
                                        : path.includes('/class-schedules')
                                        ? 'admin/schedules'
                                        : path.includes('/attendance')
                                          ? 'admin/attendance'
                                          : path.includes('/assignments')
                                            ? 'admin/assignments'
                                            : path.includes('/forum')
                                              ? 'admin/forum'
                                              : path.includes('/whatsapp')
                                                ? 'admin/whatsapp'
                                                : path.includes('/telegram')
                                                  ? 'admin/telegram'
                                                  : path.includes('/announcements')
                                                    ? 'admin/announcements'
                                                    : path.includes('/news')
                                                      ? 'admin/news'
                                                      : path.includes('/events')
                                                        ? 'admin/events'
                                                        : path.includes('/gallery')
                                                          ? 'admin/gallery'
                                                          : path.includes('/sidebar-settings')
                                                            ? 'admin/settings/sidebar'
                                                            : path.includes('/system')
                                                              ? 'admin/settings'
                                                              : path.includes('/trash')
                                                                ? 'admin/trash'
                                                                : undefined;
    (req as any).staffPage = page;
    const action: StaffAction = req.path.toLowerCase().includes('import')
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
