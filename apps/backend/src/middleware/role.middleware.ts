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
      // Staff never bypass a role list. After their module permission check
      // passes they act as org_admin of their own school (requirePermission),
      // so they reach exactly the routes an org_admin can and nothing that is
      // reserved for the platform admin.
      const allowed = allowedRoles.includes(userRole) || (req.user.isStaff === true && allowedRoles.includes('staff'));
      if (!allowed) {
        throw new ForbiddenError(
          `Access denied. Required role(s): ${allowedRoles.join(', ')}. Your role: ${userRole}.`
        );
      }

      // Institution type is a tenant-level classification, not an editable
      // organization profile field. It determines the academic hierarchy,
      // progression model, onboarding requirements, and the meaning of
      // existing class/enrollment records. Org admins may edit their own
      // organization details, but they must never be able to turn a School
      // into a University (or vice versa) through the generic organization
      // update endpoint.
      //
      // The platform admin (`admin`) owns any future institution-type
      // migration workflow. Strip both the new and legacy classification
      // fields from org-admin PATCH/PUT requests so older clients cannot
      // bypass the lock by submitting organizationType instead.
      const requestPath = `${req.baseUrl}${req.path}`;
      if (
        userRole === 'org_admin' &&
        ['PATCH', 'PUT'].includes(req.method.toUpperCase()) &&
        /\/schools\/[^/]+$/.test(requestPath)
      ) {
        if (req.body && typeof req.body === 'object') {
          delete req.body.institutionType;
          delete req.body.organizationType;
        }
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
      const isStaff = req.user.isStaff === true || req.user.role === 'staff';
      if (!isStaff) return next();
      req.user.isStaff = true;
      const page = (req as any).staffPage as string | undefined;
      // Compatibility aliases keep pre-existing generic grants working while
      // new access screens can grant precise actions such as approve/publish.
      const aliases: Partial<Record<StaffAction, StaffAction[]>> = {
        receive_payment: ['create'],
        enter_results: ['create'],
        approve: ['edit'],
        publish: ['edit'],
        submit: ['edit'],
        print: ['export'],
      };
      const candidates = [action, ...(aliases[action] || [])];
      const granted = candidates.some((candidate) =>
        req.user!.permissions.includes(`${module}.${candidate}`) ||
        Boolean(page && req.user!.permissions.includes(`page:${page}.${candidate}`))
      );
      if (!granted) throw new ForbiddenError(`Staff permission required: ${page ? `page:${page}` : module}.${action}`);
      if (!req.user.organizationId) throw new ForbiddenError('Your account is not assigned to an organization.');
      // Staff are delegated org admins of exactly one school. Acting as
      // org_admin from here on makes every controller apply its org_admin
      // tenant scope; a staff role would otherwise fall into the platform
      // admin branch of checks like `role === 'org_admin' ? own : all`.
      req.user.role = 'org_admin';
      next();
    } catch (error) {
      next(error);
    }
  };
};

/** Maps conventional REST endpoints to the page/action checkbox used by Staff. */
function staffPageForRequest(req: Request): string | undefined {
  const path = `${req.baseUrl}${req.path}`.toLowerCase();
  const method = req.method.toUpperCase();

  if (path.includes('/students/report')) return 'admin/students/report';
  if (path.includes('/students')) return 'admin/students';
  if (path.includes('/activity')) return 'admin/activity';

  if (path.includes('/courses/') && path.includes('/builder')) return 'admin/courses/builder';
  if (path.includes('/courses/') && path.includes('/gradebook')) return 'admin/courses/gradebook';
  if (path.includes('/courses/') && path.includes('/gate-report')) return 'admin/courses/gate-report';
  if (path.includes('/courses/') && path.includes('/lessons/')) return 'admin/courses/lesson-edit';
  if (path.includes('/courses/') && path.includes('/quizzes/')) return 'admin/courses/quiz-edit';
  if (path.includes('/courses/') && path.includes('/exams/')) return 'admin/courses/exam-paper-edit';
  if (path.includes('/courses/') && path.includes('/preview')) return 'admin/courses/preview';

  if (path.includes('/fee-structures')) return 'admin/payments/fee-structures';
  if (path.includes('/invoices')) return 'admin/payments/invoices';
  if (path.includes('/discount-grants') || path.includes('/fee-adjustments')) return 'admin/payments/discounts';
  if (path.includes('/payments/balances/')) return 'admin/payments/balances/detail';
  if (path.includes('/payments/balances')) return 'admin/payments/balances';
  if (path.includes('/payments/reports') || path.includes('/finance/reconciliations')) return 'admin/payments/reports';
  if (path.includes('/payments/history')) return 'admin/payments/history';
  if (path.includes('/payments/bulk')) return 'admin/payments/bulk';
  if (path.includes('/payments/record')) return 'admin/payments/record';
  if (path.includes('/payments') || path.includes('/refunds') || path.includes('/cash-sessions') || path.includes('/finance')) {
    return method === 'POST' ? 'admin/payments/record' : 'admin/payments';
  }

  if (path.includes('/exam-rooms')) return 'admin/exams/rooms';
  if (path.includes('/invigilator')) return 'admin/exams/invigilators';
  if (path.includes('/exam-incidents')) return 'admin/exams/compliance';
  if (path.includes('/exams/') && path.includes('/attendance')) return 'admin/exams/attendance';
  if (path.includes('/exams/') && path.includes('/paper/review')) return 'admin/exams/paper-review';
  if (path.includes('/results')) return method === 'GET' || method === 'HEAD' ? 'admin/results' : 'admin/results/enter';
  if (path.includes('/certificates')) return 'admin/certificates';
  if (path.includes('/exams')) return method === 'GET' || method === 'HEAD' ? 'admin/exams' : 'admin/exams/schedule';

  if (path.includes('/courses')) return 'admin/courses';
  if (path.includes('/parents')) return 'admin/parents';
  if (path.includes('/teachers')) return 'admin/teachers';
  if (path.includes('/staff')) return 'admin/staff';
  if (path.includes('/schools')) return 'admin/schools';
  if (path.includes('/users/') && (path.includes('/permissions') || path.includes('/sidebar-access'))) return 'admin/hr/access';
  if (path.includes('/users')) return 'admin/users';
  if (path.includes('/classes')) return 'admin/classes';
  if (path.includes('/class-schedules')) return 'admin/schedules';
  if (path.includes('/attendance')) return 'admin/attendance';
  if (path.includes('/assignments')) return 'admin/assignments';
  if (path.includes('/forum')) return 'admin/forum';
  if (path.includes('/whatsapp')) return 'admin/whatsapp';
  if (path.includes('/telegram')) return 'admin/telegram';
  if (path.includes('/announcements')) return 'admin/announcements';
  if (path.includes('/news')) return 'admin/news';
  if (path.includes('/events')) return 'admin/events';
  if (path.includes('/gallery')) return 'admin/gallery';
  if (path.includes('/sidebar-settings')) return 'admin/settings/sidebar';
  if (path.includes('/system')) return 'admin/settings';
  if (path.includes('/trash')) return 'admin/trash';
  return undefined;
}

function staffActionForRequest(req: Request, module: StaffModule, page?: string): StaffAction {
  const path = `${req.baseUrl}${req.path}`.toLowerCase();
  const method = req.method.toUpperCase();

  if (path.includes('publish')) return 'publish';
  if (path.includes('approve')) return 'approve';
  if (path.includes('submit')) return 'submit';
  if (path.includes('print')) return 'print';
  if (path.includes('export') || path.includes('template')) return 'export';
  if (path.includes('import')) return 'import';
  if (method === 'GET' || method === 'HEAD') return 'read';
  if (method === 'DELETE') return 'delete';
  if (module === 'finance' && method === 'POST' && (page === 'admin/payments/record' || page === 'admin/payments/bulk')) return 'receive_payment';
  if (module === 'exams' && method === 'POST' && page === 'admin/results/enter') return 'enter_results';
  if (method === 'POST') return 'create';
  return 'edit';
}

export const requireModulePermission = (module: StaffModule) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as any).staffModule = module;
    const page = staffPageForRequest(req);
    (req as any).staffPage = page;
    const action = staffActionForRequest(req, module, page);
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
