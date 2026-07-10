/**
 * Course Content Controller
 *
 * Handles curriculum building: chapters, lessons, quizzes, and assignments.
 * One content document per course (upsert pattern).
 */

import { Request, Response } from 'express';
import CourseContent from '../models/course-content.model';
import Course from '../models/course.model';
import { NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';

// ---------------------------------------------------------------------------
// GET /courses/:courseId/content — Get content for a course
// ---------------------------------------------------------------------------
export const getByCourse = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;

  // Verify course exists
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');

  let content = await CourseContent.findOne({ course: courseId }).lean();

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
    } as any;
  }

  return ApiResponse.success(res, content);
};

// ---------------------------------------------------------------------------
// PUT /courses/:courseId/content — Save/update full content (upsert)
// ---------------------------------------------------------------------------
export const saveContent = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { chapters } = req.body;

  // Verify course exists
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');

  const content = await CourseContent.findOneAndUpdate(
    { course: courseId },
    {
      course: courseId,
      chapters: chapters || [],
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  ).lean();

  return ApiResponse.success(res, content, 'Course content saved successfully');
};

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/content/chapters/reorder — Reorder chapters
// ---------------------------------------------------------------------------
export const reorderChapters = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { chapterIds } = req.body; // array of chapter _id in new order

  const content = await CourseContent.findOne({ course: courseId });
  if (!content) throw new NotFoundError('Course content');

  // Reorder chapters based on the provided ID array
  const idOrder = (chapterIds as string[]).map((id) => id.toString());
  content.chapters.sort((a: any, b: any) => {
    const aIdx = idOrder.indexOf(a._id.toString());
    const bIdx = idOrder.indexOf(b._id.toString());
    return aIdx - bIdx;
  });

  // Update order fields
  content.chapters.forEach((ch: any, idx: number) => {
    ch.order = idx;
  });

  await content.save();

  const updated = await CourseContent.findOne({ course: courseId }).lean();
  return ApiResponse.success(res, updated, 'Chapters reordered successfully');
};

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/content/chapters/:chapterId/items/reorder
// ---------------------------------------------------------------------------
export const reorderItems = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, chapterId } = req.params;
  const { itemIds } = req.body; // array of item _id in new order

  const content = await CourseContent.findOne({ course: courseId });
  if (!content) throw new NotFoundError('Course content');

  const chapter = content.chapters.find(
    (ch: any) => ch._id.toString() === chapterId
  );
  if (!chapter) throw new NotFoundError('Chapter');

  const idOrder = (itemIds as string[]).map((id) => id.toString());
  chapter.items.sort((a: any, b: any) => {
    const aIdx = idOrder.indexOf(a._id.toString());
    const bIdx = idOrder.indexOf(b._id.toString());
    return aIdx - bIdx;
  });

  chapter.items.forEach((item: any, idx: number) => {
    item.order = idx;
  });

  await content.save();

  const updated = await CourseContent.findOne({ course: courseId }).lean();
  return ApiResponse.success(res, updated, 'Items reordered successfully');
};

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/content/chapters/:chapterId/collapse
// ---------------------------------------------------------------------------
export const toggleChapterCollapse = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, chapterId } = req.params;

  const content = await CourseContent.findOne({ course: courseId });
  if (!content) throw new NotFoundError('Course content');

  const chapter = content.chapters.find(
    (ch: any) => ch._id.toString() === chapterId
  );
  if (!chapter) throw new NotFoundError('Chapter');

  chapter.collapsed = !chapter.collapsed;
  await content.save();

  const updated = await CourseContent.findOne({ course: courseId }).lean();
  return ApiResponse.success(res, updated);
};