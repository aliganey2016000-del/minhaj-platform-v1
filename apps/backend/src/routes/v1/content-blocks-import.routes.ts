/**
 * Content Blocks Import Routes — /api/v1/content-blocks-import
 * Stateless Excel/CSV → Interactive Gate Content Blocks parser for the
 * Lesson Editor's "Import" option. Admin/teacher only.
 */

import { Router } from 'express';
import multer from 'multer';
import * as controller from '../../controllers/content-blocks-import.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authMiddleware, adminOrTeacher);

// GET /api/v1/content-blocks-import/template — download the import template
router.get('/template', asyncHandler(controller.downloadContentBlocksTemplate as any));

// POST /api/v1/content-blocks-import/parse — parse an uploaded file into blocks + questions
router.post('/parse', upload.single('file'), asyncHandler(controller.parseContentBlocksImport));

export default router;
