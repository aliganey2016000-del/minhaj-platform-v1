/**
 * API v1 Route Aggregator
 *
 * Mounts all v1 resource routes under their respective paths.
 * Serves as the single entry point for /api/v1/*.
 */

import { Router } from 'express';
import authRoutes from './auth.routes';
import courseRoutes from './course.routes';
import studentRoutes from './student.routes';
import analyticsRoutes from './analytics.routes';
import paymentRoutes from './payment.routes';
import attendanceRoutes from './attendance.routes';
import classRoutes from './class.routes';
import teacherRoutes from './teacher.routes';
import parentRoutes from './parent.routes';
import examRoutes from './exam.routes';
import examRoomRoutes from './exam-room.routes';
import examIncidentRoutes from './exam-incident.routes';
import examAppealRoutes from './exam-appeal.routes';
import resultRoutes from './result.routes';
import certificateRoutes from './certificate.routes';
import assignmentRoutes from './assignment.routes';
import resourceRoutes from './resource.routes';
import notificationRoutes from './notification.routes';
import contentRoutes from './content.routes';
import systemRoutes from './system.routes';
import schoolRoutes from './school.routes';
import courseContentRoutes from './course-content.routes';
import aiRoutes from './ai.routes';
import forumRoutes from './forum.routes';

const router = Router();

// ---------------------------------------------------------------------------
// Mount resource routes
// ---------------------------------------------------------------------------

router.use('/auth', authRoutes);
router.use('/courses', courseRoutes);
router.use('/students', studentRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/payments', paymentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/classes', classRoutes);
router.use('/teachers', teacherRoutes);
router.use('/parents', parentRoutes);
router.use('/exams', examRoutes);
router.use('/exam-rooms', examRoomRoutes);
router.use('/exam-incidents', examIncidentRoutes);
router.use('/exam-appeals', examAppealRoutes);
router.use('/results', resultRoutes);
router.use('/certificates', certificateRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/resources', resourceRoutes);
router.use('/notifications', notificationRoutes);
router.use('/announcements', contentRoutes('Announcement'));
router.use('/news', contentRoutes('News'));
router.use('/events', contentRoutes('Event'));
router.use('/gallery', contentRoutes('Gallery'));
router.use('/system', systemRoutes);
router.use('/schools', schoolRoutes);
router.use('/courses/:courseId/content', courseContentRoutes);
router.use('/ai', aiRoutes);
router.use('/forum', forumRoutes);

// ---------------------------------------------------------------------------
// Health Check Endpoint
// ---------------------------------------------------------------------------

router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'API v1 is operational',
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
    errors: null,
  });
});

export default router;