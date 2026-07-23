/**
 * Learning Activity Routes — /api/v1/activity
 * Student Activity Tracking & Analytics.
 */

import { Router } from 'express';
import * as activityController from '../../controllers/learning-activity.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, anyAuthenticatedUser } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

// POST /api/v1/activity/event — any authenticated user logs their OWN activity
router.post('/event', anyAuthenticatedUser, asyncHandler(activityController.logEvent));

// Everything else is admin/teacher-only (viewing students' activity)
router.use(adminOrTeacher);

// GET /api/v1/activity/roster — students visible to the caller + online status
router.get('/roster', asyncHandler(activityController.getRoster));

// GET /api/v1/activity/timeline/:studentId
router.get('/timeline/:studentId', asyncHandler(activityController.getTimeline));

// GET /api/v1/activity/analytics/:studentId
router.get('/analytics/:studentId', asyncHandler(activityController.getAnalytics));

// GET /api/v1/activity/export/:studentId?format=csv|xlsx
router.get('/export/:studentId', asyncHandler(activityController.exportTimeline as any));

export default router;
