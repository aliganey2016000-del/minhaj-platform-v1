/**
 * Quiz Routes — /api/v1/quizzes
 *
 * Handles secure student quiz evaluation and quiz-related actions.
 */

import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware } from '../../middleware/role.middleware';
import * as quizController from '../../controllers/quiz.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['student']));

router.post('/check', asyncHandler(quizController.checkQuiz));
router.post('/submit-attempt', asyncHandler(quizController.submitAttempt));

export default router;
