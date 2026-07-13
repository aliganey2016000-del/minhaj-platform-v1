/**
 * AI Routes — /api/v1/ai
 *
 * DeepSeek-backed lesson & quiz generation for the Course Builder's
 * "AI Lesson Generator" and "AI Quiz Generator" modals. Restricted to
 * admin/teacher, same as course content authoring.
 */

import { Router } from 'express';
import multer from 'multer';
import * as aiController from '../../controllers/ai.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError } from '../../utils/api-error';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const ext = `.${file.originalname.split('.').pop()?.toLowerCase() || ''}`;
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      cb(new BadRequestError(`Unsupported file type "${ext}". Upload a PDF, Word, PowerPoint, or Excel file.`));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

// All AI routes require authentication + admin/teacher role
router.use(authMiddleware, adminOrTeacher);

// POST /api/v1/ai/generate-lesson  { mode: 'title' | 'notes', title?, notes? }
router.post('/generate-lesson', asyncHandler(aiController.generateFromText));

// POST /api/v1/ai/generate-lesson/document  (multipart/form-data, field name "file")
router.post('/generate-lesson/document', upload.single('file'), asyncHandler(aiController.generateFromDocument));

// POST /api/v1/ai/generate-quiz  { mode: 'content' | 'topic', ..., questionCounts: [{type, count}] }
router.post('/generate-quiz', asyncHandler(aiController.generateQuiz));

export default router;
