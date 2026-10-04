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
import rateLimit from 'express-rate-limit';
import * as aiController from '../../controllers/ai.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError } from '../../utils/api-error';

// Every route below (chat and generation alike) calls out to the DeepSeek
// paid LLM API — the global per-account limiter in app.ts (1000 req/min) is
// tuned for ordinary CRUD traffic and does nothing to cap a per-call API
// bill. Student-facing tutor/chat is the biggest exposure: it needs no
// elevated role, so any authenticated student (or a compromised account)
// could script hundreds of chat turns a minute, each one a paid call.
// Generation endpoints are admin/teacher-only but still hit the same paid
// API per request, so they get the same treatment. Keyed per account, same
// shape as the existing biometricLimiter/emptyTrashLimiter limiters.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ai:${req.user?.userId || req.ip}`,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many AI requests, please slow down and try again shortly.',
    data: null,
    errors: null,
  },
});

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
router.post('/tutor/chat', authMiddleware, aiLimiter, asyncHandler(aiController.tutorChat));

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
router.post('/generate-lesson', aiLimiter, asyncHandler(aiController.generateFromText));

// POST /api/v1/ai/generate-lesson/document  (multipart/form-data, field name "file")
router.post('/generate-lesson/document', aiLimiter, upload.single('file'), asyncHandler(aiController.generateFromDocument));

// POST /api/v1/ai/generate-quiz  { mode: 'content' | 'topic', ..., questionCounts: [{type, count}] }
router.post('/generate-quiz', aiLimiter, asyncHandler(aiController.generateQuiz));

// POST /api/v1/ai/generate-stop-check-question  { blockText: string }
router.post('/generate-stop-check-question', aiLimiter, asyncHandler(aiController.generateStopCheck));

// POST /api/v1/ai/split-lesson  { html: string }
router.post('/split-lesson', aiLimiter, asyncHandler(aiController.splitLesson));

// POST /api/v1/ai/generate-interactive-lesson
// { source: 'title'|'paste', title?, pasteText?, paraphrase?, blockCount, questionsPerBlock, questionType? }
router.post('/generate-interactive-lesson', aiLimiter, asyncHandler(aiController.generateInteractiveLesson));

// POST /api/v1/ai/generate-assignment  (multipart/form-data)
// Fields: sourceType ('lessons'|'paste'|'upload'), customInstructions,
// lessonContents (JSON string[]) | pasteText | file
router.post('/generate-assignment', aiLimiter, upload.single('file'), asyncHandler(aiController.generateAssignment));

export default router;
