"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminOrParentOf = exports.adminOrSelf = exports.anyAuthenticatedUser = exports.staffAndParents = exports.adminOrTeacher = exports.adminOnly = exports.roleMiddleware = void 0;
const api_error_1 = require("../utils/api-error");
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
const roleMiddleware = (allowedRoles) => {
    // Early validation — fail fast during development
    if (!allowedRoles || allowedRoles.length === 0) {
        throw new Error('roleMiddleware requires at least one allowedRole. ' +
            'Use roleMiddleware(["admin", "teacher", "student", "parent"]) ' +
            'to allow all authenticated users.');
    }
    return (req, _res, next) => {
        try {
            // 1. Ensure user is authenticated first
            if (!req.user) {
                throw new api_error_1.UnauthorizedError('Authentication required. Apply authMiddleware before roleMiddleware.');
            }
            // 2. Extract the user's role from the authenticated payload
            const userRole = req.user.role;
            // 3. Check if the user's role is in the allowed list
            if (!allowedRoles.includes(userRole)) {
                throw new api_error_1.ForbiddenError(`Access denied. Required role(s): ${allowedRoles.join(', ')}. ` +
                    `Your role: ${userRole}.`);
            }
            // Access granted
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
exports.roleMiddleware = roleMiddleware;
// ---------------------------------------------------------------------------
// Convenience Middleware — Pre-configured Role Guards
// ---------------------------------------------------------------------------
/** Allows only admin users. */
exports.adminOnly = (0, exports.roleMiddleware)(['admin']);
/** Allows admin and teacher users. */
exports.adminOrTeacher = (0, exports.roleMiddleware)(['admin', 'teacher']);
/** Allows admin, teacher, and parent users. */
exports.staffAndParents = (0, exports.roleMiddleware)(['admin', 'teacher', 'parent']);
/** Allows all authenticated users regardless of role. */
exports.anyAuthenticatedUser = (0, exports.roleMiddleware)([
    'admin',
    'teacher',
    'student',
    'parent',
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
const adminOrSelf = (getResourceOwnerId) => {
    return (req, _res, next) => {
        try {
            if (!req.user) {
                throw new api_error_1.UnauthorizedError('Authentication required');
            }
            const userRole = req.user.role;
            const resourceOwnerId = getResourceOwnerId(req);
            // Admins and teachers can access any resource
            if (userRole === 'admin' || userRole === 'teacher') {
                return next();
            }
            // Students and parents can only access their own resources
            if (req.user.userId === resourceOwnerId) {
                return next();
            }
            throw new api_error_1.ForbiddenError('You do not have permission to access this resource');
        }
        catch (error) {
            next(error);
        }
    };
};
exports.adminOrSelf = adminOrSelf;
/**
 * Allows access if the user is an admin/teacher OR a parent viewing their
 * linked child's data.
 *
 * @param getChildUserId - Function that extracts the child's user ID from request.
 */
const adminOrParentOf = (getChildUserId) => {
    return (req, _res, next) => {
        try {
            if (!req.user) {
                throw new api_error_1.UnauthorizedError('Authentication required');
            }
            const userRole = req.user.role;
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
            throw new api_error_1.ForbiddenError('You do not have permission to access this student\'s data');
        }
        catch (error) {
            next(error);
        }
    };
};
exports.adminOrParentOf = adminOrParentOf;
//# sourceMappingURL=role.middleware.js.map