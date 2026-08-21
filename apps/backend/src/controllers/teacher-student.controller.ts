/** Teacher-scoped student profile and progress aggregation. */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Student from '../models/student.model';
import Attendance from '../models/attendance.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import Gamification from '../models/gamification.model';
import { NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { assertCanAccessStudent } from '../utils/tenant-scope';

export const getStudentProfile = async (req: Request, res: Response): Promise<Response> => {
  const { studentId } = req.params;
  const student = await Student.findById(studentId)
    .populate({ path: 'user', select: 'email' })
    .populate({ path: 'profile', select: 'firstName lastName avatar' })
    .populate({ path: 'class', select: 'title section' })
    .lean();

  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);

  const studentObjectId = new mongoose.Types.ObjectId(studentId);
  const [attendanceStats, submissions, gamification] = await Promise.all([
    Attendance.aggregate([
      { $match: { student: studentObjectId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AssignmentSubmission.find({ student: studentObjectId })
      .populate({ path: 'assignment', select: 'title maxScore dueDate' })
      .populate({ path: 'course', select: 'title slug' })
      .sort({ submittedAt: -1 })
      .limit(50)
      .lean(),
    Gamification.findOne({ student: studentObjectId }).lean(),
  ]);

  const count = (status: string) => attendanceStats.find((s: any) => s._id === status)?.count || 0;
  const attendanceTotal = attendanceStats.reduce((sum: number, s: any) => sum + s.count, 0);
  const attendance = {
    total: attendanceTotal,
    present: count('present'),
    late: count('late'),
    absent: count('absent'),
    excused: count('excused'),
    percentage: attendanceTotal > 0
      ? Math.round(((count('present') + count('late') * 0.5) / attendanceTotal) * 100)
      : 0,
  };

  const graded = submissions.filter((s: any) => s.status === 'graded' || s.status === 'returned');
  const gradedWithMax = graded.filter((s: any) => typeof s.score === 'number' && Number(s.assignment?.maxScore) > 0);
  const averagePercentage = gradedWithMax.length > 0
    ? Math.round(gradedWithMax.reduce((sum: number, s: any) => sum + (s.score / Number(s.assignment.maxScore)) * 100, 0) / gradedWithMax.length)
    : null;

  const submissionSummary = {
    total: submissions.length,
    graded: graded.length,
    pending: submissions.filter((s: any) => s.status === 'submitted').length,
    averagePercentage,
  };

  return ApiResponse.success(res, {
    student: {
      _id: student._id,
      studentId: (student as any).studentId,
      name: (student as any).profile
        ? `${(student as any).profile.firstName} ${(student as any).profile.lastName}`
        : 'Unknown',
      email: (student as any).user?.email || null,
      avatar: (student as any).profile?.avatar || null,
      class: (student as any).class || null,
    },
    progress: {
      attendance,
      submissions: submissionSummary,
      gamification: {
        xp: gamification?.xp || 0,
        level: gamification?.level || 1,
        streak: gamification?.streak?.current || 0,
        badges: gamification?.earnedBadges?.map((b: any) => b.badgeKey) || [],
      },
    },
    recentSubmissions: submissions,
  });
};
