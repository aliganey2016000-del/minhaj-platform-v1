"use strict";
/**
 * Student Routes — /api/v1/students
 *
 * All routes require authentication.
 *
 * Admin/Teacher:
 *   GET    /                 — List all students (paginated, filterable)
 *   GET    /:id              — Get student by ID
 *   POST   /                 — Create student
 *   PATCH  /:id              — Update student
 *   DELETE /:id              — Soft delete student
 *   POST   /bulk-import      — Bulk import students
 *   GET    /export           — Export students
 *
 * Student (own data) + Parent (children data) + Admin/Teacher:
 *   GET    /:id/courses       — Get student's enrolled courses
 *   GET    /:id/attendance    — Get student's attendance summary
 *   GET    /:id/results       — Get student's results summary
 *   GET    /:id/payments      — Get student's payments summary
 *   GET    /:id/certificates  — Get student's certificates
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
const studentController = __importStar(require("../../controllers/student.controller"));
const auth_middleware_1 = require("../../middleware/auth.middleware");
const role_middleware_1 = require("../../middleware/role.middleware");
const async_handler_middleware_1 = require("../../middleware/async-handler.middleware");
const router = (0, express_1.Router)();
// All student routes require at minimum authentication
router.use(auth_middleware_1.authMiddleware);
// ---------------------------------------------------------------------------
// Admin/Teacher Routes
// ---------------------------------------------------------------------------
// GET /api/v1/students — List students (admin/teacher)
router.get('/', role_middleware_1.adminOrTeacher, (0, async_handler_middleware_1.asyncHandler)(studentController.getAll));
// POST /api/v1/students — Create student (admin only)
router.post('/', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(studentController.create));
// POST /api/v1/students/bulk-import — Bulk import (admin only)
router.post('/bulk-import', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(studentController.bulkImport));
// GET /api/v1/students/export — Export students (admin only)
router.get('/export', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(studentController.exportStudents));
// GET /api/v1/students/my/dashboard — Student self-service dashboard
router.get('/my/dashboard', (0, role_middleware_1.roleMiddleware)(['student']), (0, async_handler_middleware_1.asyncHandler)(studentController.getMyDashboard));
// GET /api/v1/students/my/courses — Student self-service courses
router.get('/my/courses', (0, role_middleware_1.roleMiddleware)(['student']), (0, async_handler_middleware_1.asyncHandler)(studentController.getMyCourses));
// ---------------------------------------------------------------------------
// Single Student Routes (admin/teacher + self-access)
// ---------------------------------------------------------------------------
// GET /api/v1/students/:id — Get student by ID
// Accessible by: admin, teacher, the student themselves, their parent
router.get('/:id', role_middleware_1.anyAuthenticatedUser, // Broad role check; fine-grained access in controller
(0, async_handler_middleware_1.asyncHandler)(studentController.getById));
// PATCH /api/v1/students/:id — Update student (admin only)
router.patch('/:id', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(studentController.update));
// DELETE /api/v1/students/:id — Soft delete student (admin only)
router.delete('/:id', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(studentController.remove));
// ---------------------------------------------------------------------------
// Student Related Data (enrolled courses, attendance, results, etc.)
// ---------------------------------------------------------------------------
// GET /api/v1/students/:id/courses — Get student's enrolled courses
router.get('/:id/courses', role_middleware_1.anyAuthenticatedUser, (0, async_handler_middleware_1.asyncHandler)(studentController.getCourses));
// GET /api/v1/students/:id/attendance — Get student's attendance summary
router.get('/:id/attendance', role_middleware_1.anyAuthenticatedUser, (0, async_handler_middleware_1.asyncHandler)(studentController.getAttendance));
// GET /api/v1/students/:id/results — Get student's results
router.get('/:id/results', role_middleware_1.anyAuthenticatedUser, (0, async_handler_middleware_1.asyncHandler)(studentController.getResults));
// GET /api/v1/students/:id/payments — Get student's payments
router.get('/:id/payments', (0, role_middleware_1.roleMiddleware)(['admin', 'student', 'parent']), (0, async_handler_middleware_1.asyncHandler)(studentController.getPayments));
// PATCH /api/v1/students/:id/approve — Approve student (admin only)
router.patch('/:id/approve', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(studentController.approve));
// PATCH /api/v1/students/:id/reject — Reject student (admin only)
router.patch('/:id/reject', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(studentController.reject));
// GET /api/v1/students/:id/certificates — Get student's certificates
router.get('/:id/certificates', (0, role_middleware_1.roleMiddleware)(['admin', 'student', 'parent']), (0, async_handler_middleware_1.asyncHandler)(studentController.getCertificates));
exports.default = router;
//# sourceMappingURL=student.routes.js.map