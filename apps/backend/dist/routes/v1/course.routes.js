"use strict";
/**
 * Course Routes — /api/v1/courses
 *
 * Public (no auth):
 *   GET  /                 — List published courses
 *   GET  /:slug            — Get published course by slug
 *   GET  /categories       — List course categories
 *
 * Admin/Teacher (auth required):
 *   GET  /admin            — List all courses (all statuses)
 *   GET  /:id/admin        — Get any course by ID
 *   POST /                 — Create course
 *   PATCH /:id             — Update course
 *   DELETE /:id            — Delete course
 *   POST /:id/enroll       — Enroll student
 *   POST /:id/unenroll     — Unenroll student
 *   GET  /:id/students     — Get enrolled students
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const courseController = __importStar(require("../../controllers/course.controller"));
const auth_middleware_1 = require("../../middleware/auth.middleware");
const role_middleware_1 = require("../../middleware/role.middleware");
const async_handler_middleware_1 = require("../../middleware/async-handler.middleware");
const router = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// IMPORTANT: Fixed-route paths MUST come BEFORE wildcard /:slug routes
// Otherwise Express will match "admin" as a :slug parameter
// ---------------------------------------------------------------------------
// GET /api/v1/courses/categories — List course categories
router.get('/categories', (0, async_handler_middleware_1.asyncHandler)(courseController.getCategories));
// GET /api/v1/courses/admin — List all courses (admin/teacher)
router.get('/admin', auth_middleware_1.authMiddleware, role_middleware_1.adminOrTeacher, (0, async_handler_middleware_1.asyncHandler)(courseController.getAllAdmin));
// GET /api/v1/courses — List published courses (with filtering)
router.get('/', (0, async_handler_middleware_1.asyncHandler)(courseController.getAllPublic));
// POST /api/v1/courses — Create course (admin only)
router.post('/', auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)(['admin']), (0, async_handler_middleware_1.asyncHandler)(courseController.create));
// GET /api/v1/courses/:id/admin — Get course by ID (admin/teacher)
router.get('/:id/admin', auth_middleware_1.authMiddleware, role_middleware_1.adminOrTeacher, (0, async_handler_middleware_1.asyncHandler)(courseController.getByIdAdmin));
// PATCH /api/v1/courses/:id — Update course (admin only)
router.patch('/:id', auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)(['admin']), (0, async_handler_middleware_1.asyncHandler)(courseController.update));
// DELETE /api/v1/courses/:id — Delete course (admin only)
router.delete('/:id', auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)(['admin']), (0, async_handler_middleware_1.asyncHandler)(courseController.remove));
// GET /api/v1/courses/:id/students — Get enrolled students (admin/teacher)
router.get('/:id/students', auth_middleware_1.authMiddleware, role_middleware_1.adminOrTeacher, (0, async_handler_middleware_1.asyncHandler)(courseController.getEnrolledStudents));
// POST /api/v1/courses/:courseId/enroll — Enroll student (admin only)
router.post('/:courseId/enroll', auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)(['admin']), (0, async_handler_middleware_1.asyncHandler)(courseController.enrollStudent));
// POST /api/v1/courses/:courseId/unenroll — Unenroll student (admin only)
router.post('/:courseId/unenroll', auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)(['admin']), (0, async_handler_middleware_1.asyncHandler)(courseController.unenrollStudent));
// GET /api/v1/courses/available — Available courses with enrollment status
router.get('/available', auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)(['student']), (0, async_handler_middleware_1.asyncHandler)(courseController.getAvailableCourses));
// POST /api/v1/courses/:id/self-enroll — Self enroll (student)
router.post('/:id/self-enroll', auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)(['student']), (0, async_handler_middleware_1.asyncHandler)(courseController.selfEnroll));
// POST /api/v1/courses/:id/self-unenroll — Self unenroll (student)
router.post('/:id/self-unenroll', auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)(['student']), (0, async_handler_middleware_1.asyncHandler)(courseController.selfUnenroll));
// GET /api/v1/courses/:slug — Get published course by slug (MUST be last)
router.get('/:slug', (0, async_handler_middleware_1.asyncHandler)(courseController.getBySlug));
exports.default = router;
//# sourceMappingURL=course.routes.js.map