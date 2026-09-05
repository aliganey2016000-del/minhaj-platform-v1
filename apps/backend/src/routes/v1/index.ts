/**
 * API v1 Route Aggregator
 * Mounts all v1 resource routes under their respective paths.
 */

import { Router } from 'express';
import authRoutes from './auth.routes';
import courseRoutes from './course.routes';
import mongoose from 'mongoose';
import studentRoutes from './student.routes';
import analyticsRoutes from './analytics.routes';
import paymentRoutes from './payment.routes';
import feeStructureRoutes from './fee-structure.routes';
import invoiceRoutes from './invoice.routes';
import refundRoutes from './refund.routes';
import feeAdjustmentRoutes from './fee-adjustment.routes';
import discountGrantRoutes from './discount-grant.routes';
import reportRoutes from './report.routes';
import attendanceRoutes from './attendance.routes';
import classRoutes from './class.routes';
import trashRoutes from './trash.routes';
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
import whatsappRoutes from './whatsapp.routes';
import telegramRoutes from './telegram.routes';
import contentRoutes from './content.routes';
import systemRoutes from './system.routes';
import schoolRoutes from './school.routes';
import courseContentRoutes from './course-content.routes';
import contentBlocksImportRoutes from './content-blocks-import.routes';
import lessonBlockProgressRoutes from './lesson-block-progress.routes';
import aiRoutes from './ai.routes';
import forumRoutes from './forum.routes';
import sidebarSettingRoutes from './sidebar-setting.routes';
import tenantRoutes from './tenant.routes';
import departmentRoutes from './department.routes';
import courseCategoryRoutes from './course-category.routes';
import userRoutes from './user.routes';
import classScheduleRoutes from './class-schedule.routes';
import gamificationRoutes from './gamification.routes';
import searchRoutes from './search.routes';
import quizRoutes from './quiz.routes';
import teacherPortalRoutes from './teacher-portal.routes';
import pushRoutes from './push.routes';
import learningActivityRoutes from './learning-activity.routes';
import gradebookRoutes from './gradebook.routes';
import gradebookCoursesRoutes from './gradebook-courses.routes';
import teacherAssignmentGradingRoutes from '../teacher-assignment-grading.routes';
import cashSessionRoutes from './cash-session.routes';
import accountingRoutes from './accounting.routes';
import financeReconciliationRoutes from './finance-reconciliation.routes';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireModulePermission } from '../../middleware/role.middleware';

const router = Router();
router.use('/auth', authRoutes);
router.use('/courses', courseRoutes);
router.use('/students', authMiddleware, requireModulePermission('admissions'), studentRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/payments', authMiddleware, requireModulePermission('finance'), paymentRoutes);
router.use('/fee-structures', authMiddleware, requireModulePermission('finance'), feeStructureRoutes);
router.use('/invoices', authMiddleware, requireModulePermission('finance'), invoiceRoutes);
router.use('/refunds', authMiddleware, requireModulePermission('finance'), refundRoutes);
router.use('/fee-adjustments', authMiddleware, requireModulePermission('finance'), feeAdjustmentRoutes);
router.use('/discount-grants', authMiddleware, requireModulePermission('finance'), discountGrantRoutes);
router.use('/reports', reportRoutes);
router.use('/cash-sessions', authMiddleware, requireModulePermission('finance'), cashSessionRoutes);
router.use('/finance/reconciliations', authMiddleware, requireModulePermission('finance'), financeReconciliationRoutes);
router.use('/finance', authMiddleware, requireModulePermission('finance'), accountingRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/classes', classRoutes);
router.use('/trash', trashRoutes);
router.use('/teachers', teacherRoutes);
router.use('/parents', parentRoutes);
router.use('/exams', authMiddleware, requireModulePermission('exams'), examRoutes);
router.use('/exam-rooms', authMiddleware, requireModulePermission('exams'), examRoomRoutes);
router.use('/exam-incidents', authMiddleware, requireModulePermission('exams'), examIncidentRoutes);
router.use('/exam-appeals', authMiddleware, requireModulePermission('exams'), examAppealRoutes);
router.use('/results', authMiddleware, requireModulePermission('exams'), resultRoutes);
router.use('/certificates', authMiddleware, requireModulePermission('exams'), certificateRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/resources', resourceRoutes);
router.use('/notifications', notificationRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/telegram', telegramRoutes);
router.use('/announcements', contentRoutes('Announcement'));
router.use('/news', contentRoutes('News'));
router.use('/events', contentRoutes('Event'));
router.use('/gallery', contentRoutes('Gallery'));
router.use('/system', systemRoutes);
router.use('/schools', schoolRoutes);
router.use('/courses/:courseId/content', authMiddleware, requireModulePermission('courses'), courseContentRoutes);
router.use('/content-blocks-import', contentBlocksImportRoutes);
router.use('/quizzes', quizRoutes);
router.use('/courses/:courseId/lessons/:lessonId/gate', lessonBlockProgressRoutes);
router.use('/ai', aiRoutes);
router.use('/forum', forumRoutes);
router.use('/sidebar-settings', sidebarSettingRoutes);
router.use('/tenant', tenantRoutes);
router.use('/departments', departmentRoutes);
router.use('/course-categories', courseCategoryRoutes);
router.use('/users', userRoutes);
router.use('/class-schedules', classScheduleRoutes);
router.use('/gamification', gamificationRoutes);
router.use('/search', searchRoutes);
router.use('/teacher-portal', teacherPortalRoutes);
router.use('/push', pushRoutes);
router.use('/activity', learningActivityRoutes);
router.use('/gradebook-courses', gradebookCoursesRoutes);
router.use('/gradebook/:courseId', gradebookRoutes);
router.use('/', teacherAssignmentGradingRoutes);

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, statusCode: 200, message: 'API v1 is operational', data: { uptime: process.uptime(), timestamp: new Date().toISOString(), version: '1.0.0' }, errors: null });
});

router.get('/health/ready', (_req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  const statusCode = databaseReady ? 200 : 503;
  res.status(statusCode).json({
    success: databaseReady,
    statusCode,
    message: databaseReady ? 'API v1 is ready' : 'Database is not ready',
    data: { database: databaseReady ? 'connected' : 'disconnected', timestamp: new Date().toISOString(), version: '1.0.0' },
    errors: null,
  });
});

export default router;
