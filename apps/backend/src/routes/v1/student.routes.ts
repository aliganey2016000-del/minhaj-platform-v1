/**
 * Student Routes — /api/v1/students
 *
 * All routes require authentication.
 *
 * Admin/Org Admin/Teacher:
 *   GET    /                 — List all students (paginated, filterable)
 *   GET    /:id              — Get student by ID
 *   POST   /                 — Create student
 *   PATCH  /:id              — Update student
 *   DELETE /:id              — Delete student (moves to Trash)
 *   DELETE /bulk             — Bulk delete students (moves to Trash)
 *   POST   /import/preview   — Validate/classify an import before writing
 *   POST   /import           — Bulk create/update students
 *   GET    /export           — Round-trip-safe student export (XLSX)
 *   GET    /template         — Download simplified student template (XLSX)
 *   GET    /stats            — Aggregate breakdowns for reporting
 *   GET    /report/export    — Export the analytics report (XLSX)
 */

import { Router } from 'express';
import multer from 'multer';
import * as studentController from '../../controllers/student.controller';
import * as studentRegistrationIoController from '../../controllers/student-registration-io.controller';
import * as studentDocumentsController from '../../controllers/student-documents.controller';
import * as studentRegistrationController from '../../controllers/student-registration.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import {
  roleMiddleware,
  adminOnly,
  adminOrTeacher,
  anyAuthenticatedUser,
} from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import {
  validateStudentApprovalClass,
  validateStudentCreateClass,
  validateStudentUpdateClass,
} from '../../middleware/student-class-assignment.middleware';
import { prepareStudentCreateDefaults } from '../../middleware/student-registration-defaults.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Admin/Teacher Routes
// ---------------------------------------------------------------------------

router.get(
  '/',
  adminOrTeacher,
  asyncHandler(studentController.getAll)
);

router.get(
  '/stats',
  adminOrTeacher,
  asyncHandler(studentController.getStats)
);

router.get(
  '/report/export',
  adminOnly,
  asyncHandler(studentController.exportReport as any)
);

// Add Student uses the same core registration contract as Import. Missing
// IDs/emails/passwords are system-generated before the existing controller
// runs, while class-derived academic fields remain owned by the backend.
router.post(
  '/',
  adminOnly,
  photoUpload.single('photo'),
  asyncHandler(prepareStudentCreateDefaults),
  asyncHandler(validateStudentCreateClass),
  asyncHandler(studentController.create)
);

// Preview and commit use the exact same parser/validation path. Register the
// preview route before /import and all dynamic /:id routes.
router.post(
  '/import/preview',
  adminOnly,
  upload.single('file'),
  asyncHandler(studentRegistrationIoController.previewImport)
);

router.post(
  '/import',
  adminOnly,
  upload.single('file'),
  asyncHandler(studentRegistrationIoController.bulkImport)
);

router.get(
  '/document-types',
  anyAuthenticatedUser,
  asyncHandler(studentDocumentsController.getDocumentTypes)
);

// Student photos and documents are private subresources. Their controllers
// perform the final student/organization/role authorization checks.
router.post(
  '/:studentId/photo',
  adminOnly,
  photoUpload.single('photo'),
  asyncHandler(studentDocumentsController.uploadPhoto)
);

router.get(
  '/:studentId/document-types',
  anyAuthenticatedUser,
  asyncHandler(studentDocumentsController.getDocumentTypes)
);

router.get(
  '/:studentId/documents',
  anyAuthenticatedUser,
  asyncHandler(studentDocumentsController.list)
);

router.post(
  '/:studentId/documents',
  adminOnly,
  upload.single('file'),
  asyncHandler(studentDocumentsController.upload)
);

router.get(
  '/:studentId/documents/:documentId/view',
  anyAuthenticatedUser,
  asyncHandler(studentDocumentsController.view)
);

router.delete(
  '/:studentId/documents/:documentId',
  adminOnly,
  asyncHandler(studentDocumentsController.remove)
);

router.patch(
  '/:studentId/documents/:documentId',
  adminOnly,
  upload.single('file'),
  asyncHandler(studentDocumentsController.update)
);

router.get(
  '/:studentId/registration',
  anyAuthenticatedUser,
  asyncHandler(studentRegistrationController.get)
);

router.post(
  '/:studentId/registration',
  adminOnly,
  asyncHandler(studentRegistrationController.upsert)
);

router.patch(
  '/:studentId/registration',
  adminOnly,
  asyncHandler(studentRegistrationController.upsert)
);

// Export uses the same editable columns as Import plus Student ID and
// Organization metadata, so an exported workbook can be re-imported safely.
router.get(
  '/export',
  adminOnly,
  asyncHandler(studentRegistrationIoController.exportStudents as any)
);

router.get(
  '/template',
  adminOnly,
  asyncHandler(studentRegistrationIoController.downloadTemplate as any)
);

router.delete(
  '/bulk',
  adminOnly,
  asyncHandler(studentController.bulkRemove)
);

router.get(
  '/my/dashboard',
  roleMiddleware(['student']),
  asyncHandler(studentController.getMyDashboard)
);

router.get(
  '/my/courses',
  roleMiddleware(['student']),
  asyncHandler(studentController.getMyCourses)
);

router.post(
  '/my/progress',
  roleMiddleware(['student']),
  asyncHandler(studentController.recordProgress)
);

// ---------------------------------------------------------------------------
// Single Student Routes (admin/teacher + self-access)
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  anyAuthenticatedUser,
  asyncHandler(studentController.getById)
);

router.patch(
  '/:id',
  adminOnly,
  asyncHandler(validateStudentUpdateClass),
  asyncHandler(studentController.update)
);

router.delete(
  '/:id',
  adminOnly,
  asyncHandler(studentController.remove)
);

// ---------------------------------------------------------------------------
// Student Related Data
// ---------------------------------------------------------------------------

router.get(
  '/:id/courses',
  anyAuthenticatedUser,
  asyncHandler(studentController.getCourses)
);

router.get(
  '/:id/attendance',
  anyAuthenticatedUser,
  asyncHandler(studentController.getAttendance)
);

router.get(
  '/:id/results',
  anyAuthenticatedUser,
  asyncHandler(studentController.getResults)
);

router.get(
  '/:id/payments',
  roleMiddleware(['admin', 'student', 'parent']),
  asyncHandler(studentController.getPayments)
);

router.patch(
  '/:id/approve',
  adminOnly,
  asyncHandler(validateStudentApprovalClass),
  asyncHandler(studentController.approve)
);

router.patch(
  '/:id/reject',
  adminOnly,
  asyncHandler(studentController.reject)
);

router.get(
  '/:id/certificates',
  roleMiddleware(['admin', 'student', 'parent']),
  asyncHandler(studentController.getCertificates)
);

export default router;
