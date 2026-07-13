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

// Future routes (to be implemented):
// router.use('/users', userRoutes);
// router.use('/parents', parentRoutes);
// router.use('/teachers', teacherRoutes);
// router.use('/classes', classRoutes);
// router.use('/attendance', attendanceRoutes);
// router.use('/exams', examRoutes);
// router.use('/results', resultRoutes);
// router.use('/assignments', assignmentRoutes);
// router.use('/payments', paymentRoutes);
// router.use('/certificates', certificateRoutes);
// router.use('/announcements', announcementRoutes);
// router.use('/news', newsRoutes);
// router.use('/events', eventRoutes);
// router.use('/gallery', galleryRoutes);
// router.use('/messages', messageRoutes);
// router.use('/notifications', notificationRoutes);
// router.use('/roles', roleRoutes);
// router.use('/permissions', permissionRoutes);
// router.use('/settings', settingsRoutes);
// router.use('/donations', donationRoutes);
// router.use('/upload', uploadRoutes);
// router.use('/analytics', analyticsRoutes);
// router.use('/website', websiteRoutes);
// router.use('/logs', logRoutes);

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