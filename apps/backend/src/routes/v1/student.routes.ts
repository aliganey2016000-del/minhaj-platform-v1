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

import { Router } from 'express';
import * as studentController from '../../controllers/student.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import {
  roleMiddleware,
  adminOnly,
  adminOrTeacher,
  anyAuthenticatedUser,
} from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

// All student routes require at minimum authentication
router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Admin/Teacher Routes
// ---------------------------------------------------------------------------

// GET /api/v1/students — List students (admin/teacher)
router.get(
  '/',
  adminOrTeacher,
  asyncHandler(studentController.getAll)
);

// POST /api/v1/students — Create student (admin only)
router.post(
  '/',
  adminOnly,
  asyncHandler(studentController.create)
);

// POST /api/v1/students/bulk-import — Bulk import (admin only)
router.post(
  '/bulk-import',
  adminOnly,
  asyncHandler(studentController.bulkImport)
);

// GET /api/v1/students/export — Export students (admin only)
router.get(
  '/export',
  adminOnly,
  asyncHandler(studentController.exportStudents)
);

// GET /api/v1/students/my/dashboard — Student self-service dashboard
router.get(
  '/my/dashboard',
  roleMiddleware(['student']),
  asyncHandler(studentController.getMyDashboard)
);

// GET /api/v1/students/my/courses — Student self-service courses
router.get(
  '/my/courses',
  roleMiddleware(['student']),
  asyncHandler(studentController.getMyCourses)
);

// POST /api/v1/students/my/progress — Record lesson/quiz/assignment completion
router.post(
  '/my/progress',
  roleMiddleware(['student']),
  asyncHandler(studentController.recordProgress)
);

// ---------------------------------------------------------------------------
// Single Student Routes (admin/teacher + self-access)
// ---------------------------------------------------------------------------

// GET /api/v1/students/:id — Get student by ID
// Accessible by: admin, teacher, the student themselves, their parent
router.get(
  '/:id',
  anyAuthenticatedUser, // Broad role check; fine-grained access in controller
  asyncHandler(studentController.getById)
);

// PATCH /api/v1/students/:id — Update student (admin only)
router.patch(
  '/:id',
  adminOnly,
  asyncHandler(studentController.update)
);

// DELETE /api/v1/students/:id — Soft delete student (admin only)
router.delete(
  '/:id',
  adminOnly,
  asyncHandler(studentController.remove)
);

// ---------------------------------------------------------------------------
// Student Related Data (enrolled courses, attendance, results, etc.)
// ---------------------------------------------------------------------------

// GET /api/v1/students/:id/courses — Get student's enrolled courses
router.get(
  '/:id/courses',
  anyAuthenticatedUser,
  asyncHandler(studentController.getCourses)
);

// GET /api/v1/students/:id/attendance — Get student's attendance summary
router.get(
  '/:id/attendance',
  anyAuthenticatedUser,
  asyncHandler(studentController.getAttendance)
);

// GET /api/v1/students/:id/results — Get student's results
router.get(
  '/:id/results',
  anyAuthenticatedUser,
  asyncHandler(studentController.getResults)
);

// GET /api/v1/students/:id/payments — Get student's payments
router.get(
  '/:id/payments',
  roleMiddleware(['admin', 'student', 'parent']),
  asyncHandler(studentController.getPayments)
);

// PATCH /api/v1/students/:id/approve — Approve student (admin only)
router.patch(
  '/:id/approve',
  adminOnly,
  asyncHandler(studentController.approve)
);

// PATCH /api/v1/students/:id/reject — Reject student (admin only)
router.patch(
  '/:id/reject',
  adminOnly,
  asyncHandler(studentController.reject)
);

// GET /api/v1/students/:id/certificates — Get student's certificates
router.get(
  '/:id/certificates',
  roleMiddleware(['admin', 'student', 'parent']),
  asyncHandler(studentController.getCertificates)
);

export default router;