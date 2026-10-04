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

// POST /gamification/streak/update  — daily streak check
// POST /gamification/complete-lesson — lesson completion hook
// POST /gamification/complete-quiz  — quiz completion hook
//
// There is intentionally no POST /gamification/xp here: it used to let any
// authenticated student self-report an arbitrary `amount`/`source` and have
// it added to their own XP total unconditionally (no cap, no verification
// that the claimed action actually happened, callable in a loop for
// unlimited self-farmed XP/leaderboard rank) — nothing in the frontend ever
// called it. If a genuine admin/teacher-triggered manual-award flow is
// needed later, it must target a specific student by id (not "whoever is
// calling"), gate behind an admin/teacher role, and cap the amount.
router.post('/streak/update', asyncHandler(updateStreak));
router.post('/complete-lesson', asyncHandler(completeLesson));
router.post('/complete-quiz', asyncHandler(completeQuiz));

export default router;