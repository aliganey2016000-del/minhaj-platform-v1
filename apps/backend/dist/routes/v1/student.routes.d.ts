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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=student.routes.d.ts.map