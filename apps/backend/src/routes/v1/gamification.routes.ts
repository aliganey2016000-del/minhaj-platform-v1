/**
 * Gamification Routes
 *
 * Mounted at /api/v1/gamification
 * All routes require student authentication.
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import {
  getMyGamification,
  addXP,
  updateStreak,
  completeLesson,
  completeQuiz,
  getLeaderboard,
} from '../../controllers/gamification.controller';

const router = Router();

// All routes require student role
router.use(authMiddleware);
router.use(roleMiddleware(['student']));

// GET  /gamification/my         — full gamification profile
// GET  /gamification/leaderboard — top students
router.get('/my', asyncHandler(getMyGamification));
router.get('/leaderboard', asyncHandler(getLeaderboard));

// POST /gamification/xp             — manual XP addition (for admin-triggered events)
// POST /gamification/streak/update  — daily streak check
// POST /gamification/complete-lesson — lesson completion hook
// POST /gamification/complete-quiz  — quiz completion hook
router.post('/xp', asyncHandler(addXP));
router.post('/streak/update', asyncHandler(updateStreak));
router.post('/complete-lesson', asyncHandler(completeLesson));
router.post('/complete-quiz', asyncHandler(completeQuiz));

export default router;