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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=course.routes.d.ts.map