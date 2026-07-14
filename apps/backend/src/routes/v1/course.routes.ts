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

import { Router } from 'express';
import * as courseController from '../../controllers/course.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware, adminOnly, adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

// ---------------------------------------------------------------------------
// IMPORTANT: Fixed-route paths MUST come BEFORE wildcard /:slug routes
// Otherwise Express will match "admin" as a :slug parameter
// ---------------------------------------------------------------------------

// GET /api/v1/courses/categories — List course categories
router.get(
  '/categories',
  asyncHandler(courseController.getCategories)
);

// GET /api/v1/courses/admin — List all courses (admin/teacher)
router.get(
  '/admin',
  authMiddleware,
  adminOrTeacher,
  asyncHandler(courseController.getAllAdmin)
);

// GET /api/v1/courses — List published courses (with filtering)
router.get(
  '/',
  asyncHandler(courseController.getAllPublic)
);

// POST /api/v1/courses — Create course (admin or org_admin — scoped to own org)
router.post(
  '/',
  authMiddleware,
  adminOnly,
  asyncHandler(courseController.create)
);

// GET /api/v1/courses/:id/admin — Get course by ID (admin/teacher)
router.get(
  '/:id/admin',
  authMiddleware,
  adminOrTeacher,
  asyncHandler(courseController.getByIdAdmin)
);

// PATCH /api/v1/courses/:id — Update course (admin or org_admin — scoped to own org)
router.patch(
  '/:id',
  authMiddleware,
  adminOnly,
  asyncHandler(courseController.update)
);

// DELETE /api/v1/courses/:id — Delete course (admin or org_admin — scoped to own org)
router.delete(
  '/:id',
  authMiddleware,
  adminOnly,
  asyncHandler(courseController.remove)
);

// GET /api/v1/courses/:id/students — Get enrolled students (admin/teacher)
router.get(
  '/:id/students',
  authMiddleware,
  adminOrTeacher,
  asyncHandler(courseController.getEnrolledStudents)
);

// POST /api/v1/courses/:courseId/enroll — Enroll student (admin only)
router.post(
  '/:courseId/enroll',
  authMiddleware,
  roleMiddleware(['admin']),
  asyncHandler(courseController.enrollStudent)
);

// POST /api/v1/courses/:courseId/unenroll — Unenroll student (admin only)
router.post(
  '/:courseId/unenroll',
  authMiddleware,
  roleMiddleware(['admin']),
  asyncHandler(courseController.unenrollStudent)
);

// GET /api/v1/courses/available — Available courses with enrollment status
router.get(
  '/available',
  authMiddleware,
  roleMiddleware(['student']),
  asyncHandler(courseController.getAvailableCourses)
);

// POST /api/v1/courses/:id/self-enroll — Self enroll (student)
router.post(
  '/:id/self-enroll',
  authMiddleware,
  roleMiddleware(['student']),
  asyncHandler(courseController.selfEnroll)
);

// POST /api/v1/courses/:id/self-unenroll — Self unenroll (student)
router.post(
  '/:id/self-unenroll',
  authMiddleware,
  roleMiddleware(['student']),
  asyncHandler(courseController.selfUnenroll)
);

// GET /api/v1/courses/:slug — Get published course by slug (MUST be last)
router.get(
  '/:slug',
  asyncHandler(courseController.getBySlug)
);

export default router;
