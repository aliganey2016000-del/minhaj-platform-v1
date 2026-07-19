/**
 * AI Routes — /api/v1/ai
 *
 * DeepSeek-backed lesson & quiz generation for the Course Builder's
 * "AI Lesson Generator" and "AI Quiz Generator" modals, plus the
 * student-facing AI Tutor chat endpoint.
 *
 * Admin/teacher routes require adminOrTeacher middleware.
 * Tutor chat requires only authentication (student-accessible).
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

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      cb(new BadRequestError('File must be an audio recording.'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

// ── Student-accessible routes (auth only, no role check) ──
// POST /api/v1/ai/tutor/chat — AI Tutor conversation (student-facing)
router.post('/tutor/chat', authMiddleware, asyncHandler(aiController.tutorChat));

// POST /api/v1/ai/tutor/voice-note — stores a recorded voice message (no
// transcription — see controller comment for why), field name "file"
router.post('/tutor/voice-note', authMiddleware, audioUpload.single('file'), asyncHandler(aiController.uploadVoiceNote));

// GET /api/v1/ai/tutor/voice-note/:filename — stream it back for playback
router.get('/tutor/voice-note/:filename', authMiddleware, asyncHandler(aiController.getVoiceNote));

// ── Admin/Teacher routes (require auth + adminOrTeacher) ──
// Apply admin/teacher middleware for ALL remaining routes *after* the
// student route so tutor/chat is only gated by authentication.
router.use(authMiddleware, adminOrTeacher);

// POST /api/v1/ai/generate-lesson  { mode: 'title' | 'notes', title?, notes? }
router.post('/generate-lesson', asyncHandler(aiController.generateFromText));

// POST /api/v1/ai/generate-lesson/document  (multipart/form-data, field name "file")
router.post('/generate-lesson/document', upload.single('file'), asyncHandler(aiController.generateFromDocument));

// POST /api/v1/ai/generate-quiz  { mode: 'content' | 'topic', ..., questionCounts: [{type, count}] }
router.post('/generate-quiz', asyncHandler(aiController.generateQuiz));

// POST /api/v1/ai/generate-stop-check-question  { blockText: string }
router.post('/generate-stop-check-question', asyncHandler(aiController.generateStopCheck));

// POST /api/v1/ai/split-lesson  { html: string }
router.post('/split-lesson', asyncHandler(aiController.splitLesson));

// POST /api/v1/ai/generate-assignment  (multipart/form-data)
// Fields: sourceType ('lessons'|'paste'|'upload'), customInstructions,
// lessonContents (JSON string[]) | pasteText | file
router.post('/generate-assignment', upload.single('file'), asyncHandler(aiController.generateAssignment));

export default router;
