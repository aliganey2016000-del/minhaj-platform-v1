import mongoose from 'mongoose';
import { Request, Response } from 'express';
import Attendance from '../models/attendance.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

function dateRange(rawFrom: unknown, rawTo: unknown) {
  if (!rawFrom) return null;
  const from = new Date(String(rawFrom));
  if (Number.isNaN(from.getTime())) throw new BadRequestError('Invalid report start date.');
  from.setHours(0, 0, 0, 0);
  const to = rawTo ? new Date(String(rawTo)) : new Date();
  if (Number.isNaN(to.getTime())) throw new BadRequestError('Invalid report end date.');
  to.setHours(23, 59, 59, 999);
  if (to < from) throw new BadRequestError('Report end date cannot be before start date.');
  return { $gte: from, $lte: to };
}

/**
 * Status-accurate attendance report.
 *
 * Excused is reported independently rather than being silently folded into
 * Absent. Late means the student attended the lesson, so the attendance rate
 * is (Present + Late) / Total. Schools can later apply local policy to the
 * separate raw counts without losing information.
 */
export const getCourseReport = async (req: Request, res: Response): Promise<Response> => {
  const courseId = String(req.query.courseId || '');
  if (!mongoose.isValidObjectId(courseId)) throw new BadRequestError('courseId query param required');

  const course: any = (req as any).attendanceCourse || await Course.findById(courseId).lean();
  if (!course) throw new NotFoundError('Course');
  const school = course.school ? await School.findById(course.school).select('attendanceType').lean() : null;
  const studentFilter = school?.attendanceType === 'class_based' && course.class
    ? { school: course.school, class: course.class, status: 'active', approvalStatus: 'approved' }
    : { school: course.school, enrolledCourses: course._id, status: 'active', approvalStatus: 'approved' };

  const students: any[] = await Student.find(studentFilter)
    .populate('profile', 'firstName lastName')
    .select('studentId profile')
    .lean();
  const studentIds = students.map((student) => student._id);

  const match: Record<string, unknown> = {
    course: new mongoose.Types.ObjectId(courseId),
    student: { $in: studentIds },
  };
  const range = dateRange(req.query.dateFrom, req.query.dateTo);
  if (range) match.date = range;

  const stats: any[] = await Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$student',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
      },
    },
  ]);
  const statsMap = new Map(stats.map((row) => [String(row._id), row]));

  const report = students.map((student: any) => {
    const row: any = statsMap.get(String(student._id));
    const total = row?.total || 0;
    const present = row?.present || 0;
    const late = row?.late || 0;
    const absent = row?.absent || 0;
    const excused = row?.excused || 0;
    return {
      _id: student._id,
      studentId: student.studentId,
      name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId,
      total,
      present,
      late,
      absent,
      excused,
      missed: absent + excused,
      percentage: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
    };
  });

  return ApiResponse.success(res, report);
};
