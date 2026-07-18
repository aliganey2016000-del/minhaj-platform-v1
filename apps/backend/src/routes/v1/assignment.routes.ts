import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../../controllers/assignment.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

// ---------------------------------------------------------------------------
// Multer configuration — store files in memory so controller can save to
// local disk or cloud storage (S3 / Supabase). 15 MB limit per file.
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = Router();
router.use(authMiddleware);

// Student self-service
router.get('/my', roleMiddleware(['student']), asyncHandler(ctrl.getMyAssignments));

// Admin / Org Admin / Teacher management
router.get('/',  adminOrTeacher, asyncHandler(ctrl.getAll));
router.post('/', adminOrTeacher, asyncHandler(ctrl.create));          // Teachers can create
router.patch('/:id', adminOrTeacher, asyncHandler(ctrl.update));       // Teachers can update
router.patch('/:id/status', adminOrTeacher, asyncHandler(ctrl.updateStatus));
router.delete('/:id', adminOrTeacher, asyncHandler(ctrl.remove));      // Teachers can delete

// ── Attachment upload ──
// POST /assignments/upload — multipart/form-data, field name "file"
// Optional body field: allowDownload (boolean, default false)
router.post('/upload', adminOrTeacher, upload.single('file'), asyncHandler(ctrl.uploadAttachment));

// ── Material streaming/view ──
// GET /assignments/materials/:id/view?assignmentId=... — stream assignment attachment
// inline so students can view PDFs/docs/images in the browser without downloading.
// Requires auth (student scoped to their own enrolled courses).
router.get('/materials/:id/view', authMiddleware, asyncHandler(ctrl.viewMaterial));

export default router;
