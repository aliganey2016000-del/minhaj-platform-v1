"use strict";
/**
 * Course Content Controller
 *
 * Handles curriculum building: chapters, lessons, quizzes, and assignments.
 * One content document per course (upsert pattern).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleChapterCollapse = exports.reorderItems = exports.reorderChapters = exports.saveContent = exports.getByCourse = void 0;
const course_content_model_1 = __importDefault(require("../models/course-content.model"));
const course_model_1 = __importDefault(require("../models/course.model"));
const api_error_1 = require("../utils/api-error");
const api_response_1 = __importDefault(require("../utils/api-response"));
// ---------------------------------------------------------------------------
// GET /courses/:courseId/content — Get content for a course
// ---------------------------------------------------------------------------
const getByCourse = async (req, res) => {
    const { courseId } = req.params;
    // Verify course exists
    const course = await course_model_1.default.findById(courseId);
    if (!course)
        throw new api_error_1.NotFoundError('Course');
    let content = await course_content_model_1.default.findOne({ course: courseId }).lean();
    // Return empty structure if no content exists yet
    if (!content) {
        content = {
            course: courseId,
            chapters: [],
            totalDuration: 0,
            totalLessons: 0,
            totalQuizzes: 0,
            totalAssignments: 0,
            lastSaved: new Date(),
        };
    }
    return api_response_1.default.success(res, content);
};
exports.getByCourse = getByCourse;
// ---------------------------------------------------------------------------
// PUT /courses/:courseId/content — Save/update full content (upsert)
// ---------------------------------------------------------------------------
const saveContent = async (req, res) => {
    const { courseId } = req.params;
    const { chapters } = req.body;
    // Verify course exists
    const course = await course_model_1.default.findById(courseId);
    if (!course)
        throw new api_error_1.NotFoundError('Course');
    const content = await course_content_model_1.default.findOneAndUpdate({ course: courseId }, {
        course: courseId,
        chapters: chapters || [],
    }, {
        new: true,
        upsert: true,
        runValidators: true,
    }).lean();
    return api_response_1.default.success(res, content, 'Course content saved successfully');
};
exports.saveContent = saveContent;
// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/content/chapters/reorder — Reorder chapters
// ---------------------------------------------------------------------------
const reorderChapters = async (req, res) => {
    const { courseId } = req.params;
    const { chapterIds } = req.body; // array of chapter _id in new order
    const content = await course_content_model_1.default.findOne({ course: courseId });
    if (!content)
        throw new api_error_1.NotFoundError('Course content');
    // Reorder chapters based on the provided ID array
    const idOrder = chapterIds.map((id) => id.toString());
    content.chapters.sort((a, b) => {
        const aIdx = idOrder.indexOf(a._id.toString());
        const bIdx = idOrder.indexOf(b._id.toString());
        return aIdx - bIdx;
    });
    // Update order fields
    content.chapters.forEach((ch, idx) => {
        ch.order = idx;
    });
    await content.save();
    const updated = await course_content_model_1.default.findOne({ course: courseId }).lean();
    return api_response_1.default.success(res, updated, 'Chapters reordered successfully');
};
exports.reorderChapters = reorderChapters;
// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/content/chapters/:chapterId/items/reorder
// ---------------------------------------------------------------------------
const reorderItems = async (req, res) => {
    const { courseId, chapterId } = req.params;
    const { itemIds } = req.body; // array of item _id in new order
    const content = await course_content_model_1.default.findOne({ course: courseId });
    if (!content)
        throw new api_error_1.NotFoundError('Course content');
    const chapter = content.chapters.find((ch) => ch._id.toString() === chapterId);
    if (!chapter)
        throw new api_error_1.NotFoundError('Chapter');
    const idOrder = itemIds.map((id) => id.toString());
    chapter.items.sort((a, b) => {
        const aIdx = idOrder.indexOf(a._id.toString());
        const bIdx = idOrder.indexOf(b._id.toString());
        return aIdx - bIdx;
    });
    chapter.items.forEach((item, idx) => {
        item.order = idx;
    });
    await content.save();
    const updated = await course_content_model_1.default.findOne({ course: courseId }).lean();
    return api_response_1.default.success(res, updated, 'Items reordered successfully');
};
exports.reorderItems = reorderItems;
// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/content/chapters/:chapterId/collapse
// ---------------------------------------------------------------------------
const toggleChapterCollapse = async (req, res) => {
    const { courseId, chapterId } = req.params;
    const content = await course_content_model_1.default.findOne({ course: courseId });
    if (!content)
        throw new api_error_1.NotFoundError('Course content');
    const chapter = content.chapters.find((ch) => ch._id.toString() === chapterId);
    if (!chapter)
        throw new api_error_1.NotFoundError('Chapter');
    chapter.collapsed = !chapter.collapsed;
    await content.save();
    const updated = await course_content_model_1.default.findOne({ course: courseId }).lean();
    return api_response_1.default.success(res, updated);
};
exports.toggleChapterCollapse = toggleChapterCollapse;
//# sourceMappingURL=course-content.controller.js.map