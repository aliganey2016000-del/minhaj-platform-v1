"use strict";
/**
 * API v1 Route Aggregator
 *
 * Mounts all v1 resource routes under their respective paths.
 * Serves as the single entry point for /api/v1/*.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const course_routes_1 = __importDefault(require("./course.routes"));
const student_routes_1 = __importDefault(require("./student.routes"));
const analytics_routes_1 = __importDefault(require("./analytics.routes"));
const payment_routes_1 = __importDefault(require("./payment.routes"));
const attendance_routes_1 = __importDefault(require("./attendance.routes"));
const class_routes_1 = __importDefault(require("./class.routes"));
const teacher_routes_1 = __importDefault(require("./teacher.routes"));
const parent_routes_1 = __importDefault(require("./parent.routes"));
const exam_routes_1 = __importDefault(require("./exam.routes"));
const result_routes_1 = __importDefault(require("./result.routes"));
const certificate_routes_1 = __importDefault(require("./certificate.routes"));
const assignment_routes_1 = __importDefault(require("./assignment.routes"));
const resource_routes_1 = __importDefault(require("./resource.routes"));
const notification_routes_1 = __importDefault(require("./notification.routes"));
const content_routes_1 = __importDefault(require("./content.routes"));
const system_routes_1 = __importDefault(require("./system.routes"));
const school_routes_1 = __importDefault(require("./school.routes"));
const course_content_routes_1 = __importDefault(require("./course-content.routes"));
const router = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// Mount resource routes
// ---------------------------------------------------------------------------
router.use('/auth', auth_routes_1.default);
router.use('/courses', course_routes_1.default);
router.use('/students', student_routes_1.default);
router.use('/analytics', analytics_routes_1.default);
router.use('/payments', payment_routes_1.default);
router.use('/attendance', attendance_routes_1.default);
router.use('/classes', class_routes_1.default);
router.use('/teachers', teacher_routes_1.default);
router.use('/parents', parent_routes_1.default);
router.use('/exams', exam_routes_1.default);
router.use('/results', result_routes_1.default);
router.use('/certificates', certificate_routes_1.default);
router.use('/assignments', assignment_routes_1.default);
router.use('/resources', resource_routes_1.default);
router.use('/notifications', notification_routes_1.default);
router.use('/announcements', (0, content_routes_1.default)('Announcement'));
router.use('/news', (0, content_routes_1.default)('News'));
router.use('/events', (0, content_routes_1.default)('Event'));
router.use('/gallery', (0, content_routes_1.default)('Gallery'));
router.use('/system', system_routes_1.default);
router.use('/schools', school_routes_1.default);
router.use('/courses/:courseId/content', course_content_routes_1.default);
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
exports.default = router;
//# sourceMappingURL=index.js.map