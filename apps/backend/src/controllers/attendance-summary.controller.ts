import mongoose from 'mongoose';
import { Request, Response } from 'express';
import Attendance from '../models/attendance.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';

function summarize(stats: any[]) {
  const total = stats.reduce((sum: number, row: any) => sum + (row.count || 0), 0);
  const present = stats.find((row: any) => row._id === 'present')?.count || 0;
  const late = stats.find((row: any) => row._id === 'late')?.count || 0;
  const absent = stats.find((row: any) => row._id === 'absent')?.count || 0;
  const excused = stats.find((row: any) => row._id === 'excused')?.count || 0;
  const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
  return { total, present, late, absent, excused, percentage };
}

export const getMyAttendance = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const stats = await Attendance.aggregate([
    { $match: { student: student._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  return ApiResponse.success(res, { studentId: (student as any).studentId, ...summarize(stats) });
};

export const getStudentSummary = async (req: Request, res: Response): Promise<Response> => {
  const studentId = String(req.params.studentId || '');
  if (!mongoose.isValidObjectId(studentId)) throw new BadRequestError('A valid student is required.');
  const student: any = (req as any).attendanceStudent || await Student.findById(studentId).lean();
  if (!student) throw new NotFoundError('Student');
  const stats = await Attendance.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  return ApiResponse.success(res, { studentId: student.studentId, ...summarize(stats) });
};

export const getMyAttendanceByCourse = async (req: Request, res: Response): Promise<Response> => {
  const student: any = await ensureStudentRecord(req.user!.userId);
  const school = student.school ? await School.findById(student.school).select('attendanceType').lean() : null;
  const courseFilter = school?.attendanceType === 'class_based' && student.class
    ? { school: student.school, class: student.class }
    : { _id: { $in: student.enrolledCourses } };

  const courses: any[] = await Course.find(courseFilter)
    .select('title slug courseCode category class')
    .populate('class', 'title section')
    .lean();
  const stats: any[] = await Attendance.aggregate([
    { $match: { student: student._id } },
    {
      $group: {
        _id: '$course',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
      },
    },
  ]);
  const statsMap = new Map(stats.map((row: any) => [String(row._id), row]));

  const result = courses.map((course: any) => {
    const row: any = statsMap.get(String(course._id));
    const total = row?.total || 0;
    const present = row?.present || 0;
    const late = row?.late || 0;
    const absent = row?.absent || 0;
    const excused = row?.excused || 0;
    return {
      courseId: course._id,
      code: course.courseCode || course.slug?.toUpperCase() || '',
      title: course.title?.en || 'Unknown Course',
      section: course.class ? `${course.class.title} (${course.class.section})` : course.category || '',
      days: total,
      present,
      absent,
      late,
      excused,
      presentPercentage: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      absentPercentage: total > 0 ? Math.round((absent / total) * 100) : 0,
    };
  }).sort((a: any, b: any) => b.days - a.days);

  return ApiResponse.success(res, result);
};
