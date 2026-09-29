/**
 * Teacher Dashboard Controller
 *
 * Read-only dashboard aggregation kept separate from the broader Teacher Portal
 * controller so dashboard metrics can evolve without coupling to course editing
 * and grading handlers.
 */

import { Request, Response } from 'express';
import Course from '../models/course.model';
import Assignment from '../models/assignment.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import Student from '../models/student.model';
import { ForbiddenError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

async function getTeacherScope(req: Request) {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');
  return { teacher, courseFilter: { teacher: teacher._id } };
}

export const getDashboard = async (req: Request, res: Response): Promise<Response> => {
  const { teacher, courseFilter } = await getTeacherScope(req);

  const [activeCourses, draftCourses] = await Promise.all([
    Course.find({ ...courseFilter, status: 'published' })
      .populate({ path: 'school', select: 'name slug' })
      .populate({ path: 'class', select: 'title section' })
      .select('title slug description category level duration fee enrolledStudents maxStudents status thumbnail class school')
      .lean(),
    Course.find({ ...courseFilter, status: 'draft' })
      .select('title slug status updatedAt')
      .lean(),
  ]);

  const allCourseIds = [...activeCourses, ...draftCourses].map((course: any) => course._id);
  const submissionFilter = {
    course: { $in: allCourseIds },
    status: 'submitted' as const,
  };

  const assignedClassIds = [...new Set(
    activeCourses
      .map((course: any) => String(course.class?._id || course.class || ''))
      .filter(Boolean)
  )];

  // Dashboard student totals are class-based, not course-enrollment based.
  // Any active student registered in a class taught by this teacher counts,
  // even when the student has no enrolledCourses entries.
  const [pendingCount, pendingSubmissions, scopedStudents, performanceRows] = await Promise.all([
    AssignmentSubmission.countDocuments(submissionFilter),
    AssignmentSubmission.find(submissionFilter)
      .populate({ path: 'student', select: 'profile', populate: { path: 'profile', select: 'firstName lastName avatar' } })
      .populate({ path: 'assignment', select: 'title dueDate' })
      .populate({ path: 'course', select: 'title' })
      .sort({ submittedAt: -1 })
      .limit(20)
      .lean(),
    assignedClassIds.length
      ? Student.find({ status: 'active', class: { $in: assignedClassIds } })
          .select('_id class')
          .lean()
      : Promise.resolve([]),
    AssignmentSubmission.aggregate([
      {
        $match: {
          course: { $in: allCourseIds },
          status: { $in: ['graded', 'returned'] },
          score: { $ne: null },
        },
      },
      {
        $lookup: {
          from: Assignment.collection.name,
          localField: 'assignment',
          foreignField: '_id',
          as: 'assignmentDoc',
        },
      },
      { $unwind: '$assignmentDoc' },
      { $match: { 'assignmentDoc.totalMarks': { $gt: 0 } } },
      {
        $project: {
          percentage: {
            $multiply: [
              { $divide: ['$score', '$assignmentDoc.totalMarks'] },
              100,
            ],
          },
        },
      },
      { $group: { _id: null, average: { $avg: '$percentage' }, count: { $sum: 1 } } },
    ]),
  ]);

  const courseStudentCounts = new Map<string, number>();
  for (const course of activeCourses as any[]) {
    const courseId = String(course._id);
    const classId = String(course.class?._id || course.class || '');
    const count = (scopedStudents as any[]).filter((student: any) =>
      classId && String(student.class || '') === classId
    ).length;
    courseStudentCounts.set(courseId, count);
  }

  const activeCoursesWithCounts = (activeCourses as any[]).map((course: any) => ({
    ...course,
    studentCount: courseStudentCounts.get(String(course._id)) || 0,
  }));

  const performanceSamples = Number(performanceRows[0]?.count || 0);
  const rawAverage = Number(performanceRows[0]?.average || 0);
  const avgPerformance = performanceSamples > 0
    ? Math.round(Math.max(0, Math.min(100, rawAverage)))
    : null;

  return ApiResponse.success(res, {
    activeCourses: activeCoursesWithCounts,
    draftCourses,
    pendingSubmissions: pendingSubmissions.map((submission: any) => ({
      _id: submission._id,
      studentName: submission.student?.profile
        ? `${submission.student.profile.firstName} ${submission.student.profile.lastName}`
        : 'Unknown',
      assignmentTitle: submission.assignment?.title || 'Untitled',
      courseTitle: submission.course?.title?.en || 'Untitled',
      submittedAt: submission.submittedAt,
      status: submission.status,
    })),
    stats: {
      totalCourses: activeCourses.length,
      totalStudents: (scopedStudents as any[]).length,
      pendingSubmissions: pendingCount,
      avgPerformance,
      performanceSamples,
    },
    teacher: {
      teacherId: teacher.teacherId,
      qualification: teacher.qualification,
      specialization: teacher.specialization,
      coursePermission: teacher.coursePermission || 'COURSE_BUILDER',
    },
  });
};
