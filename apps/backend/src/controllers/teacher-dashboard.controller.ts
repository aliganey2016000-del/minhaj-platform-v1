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
      .select('title slug description category level duration fee enrolledStudents maxStudents status thumbnail')
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

  const [pendingCount, pendingSubmissions, enrolledStudents, performanceRows] = await Promise.all([
    AssignmentSubmission.countDocuments(submissionFilter),
    AssignmentSubmission.find(submissionFilter)
      .populate({ path: 'student', select: 'profile', populate: { path: 'profile', select: 'firstName lastName avatar' } })
      .populate({ path: 'assignment', select: 'title dueDate' })
      .populate({ path: 'course', select: 'title' })
      .sort({ submittedAt: -1 })
      .limit(20)
      .lean(),
    Student.countDocuments({ enrolledCourses: { $in: allCourseIds } }),
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

  const rawAverage = Number(performanceRows[0]?.average || 0);
  const avgPerformance = Math.round(Math.max(0, Math.min(100, rawAverage)));

  return ApiResponse.success(res, {
    activeCourses,
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
      totalStudents: enrolledStudents,
      pendingSubmissions: pendingCount,
      avgPerformance,
    },
    teacher: {
      teacherId: teacher.teacherId,
      qualification: teacher.qualification,
      specialization: teacher.specialization,
      coursePermission: teacher.coursePermission || 'COURSE_BUILDER',
    },
  });
};
