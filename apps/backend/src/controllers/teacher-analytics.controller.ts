/** Teacher-scoped actionable analytics for the Teacher Portal. */

import { Request, Response } from 'express';
import Course from '../models/course.model';
import Student from '../models/student.model';
import Attendance from '../models/attendance.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import ApiResponse from '../utils/api-response';
import { ForbiddenError } from '../utils/api-error';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)));

export const getOverview = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');

  const courses = await Course.find({ teacher: teacher._id }).select('_id title status').lean();
  const courseIds = courses.map((c: any) => c._id);
  if (courseIds.length === 0) {
    return ApiResponse.success(res, {
      summary: { students: 0, gradedSubmissions: 0, averageGrade: null, pendingSubmissions: 0 },
      atRiskStudents: [], decliningStudents: [], difficultAssignments: [], coursePerformance: [],
    });
  }

  const students = await Student.find({ enrolledCourses: { $in: courseIds }, status: 'active' })
    .select('_id studentId profile')
    .populate({ path: 'profile', select: 'firstName lastName avatar' })
    .lean();
  const studentIds = students.map((s: any) => s._id);
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const [submissions, attendanceRows] = await Promise.all([
    AssignmentSubmission.find({ course: { $in: courseIds }, student: { $in: studentIds }, submittedAt: { $gte: since } })
      .select('student course assignment status score submittedAt')
      .populate({ path: 'assignment', select: 'title totalMarks' })
      .lean(),
    Attendance.aggregate([
      { $match: { course: { $in: courseIds }, student: { $in: studentIds }, date: { $gte: since } } },
      { $group: { _id: { student: '$student', status: '$status' }, count: { $sum: 1 } } },
    ]),
  ]);

  const attMap = new Map<string, { total: number; present: number; late: number; absent: number; excused: number }>();
  for (const row of attendanceRows as any[]) {
    const key = String(row._id.student);
    const current = attMap.get(key) || { total: 0, present: 0, late: 0, absent: 0, excused: 0 };
    const status = row._id.status as keyof typeof current;
    if (status in current) current[status] += row.count;
    current.total += row.count;
    attMap.set(key, current);
  }

  const stats = new Map<string, { graded: number; pending: number; scoreSum: number; recent: number[]; prior: number[] }>();
  const assignmentStats = new Map<string, { title: string; sum: number; count: number }>();
  const courseStats = new Map<string, { sum: number; count: number }>();
  for (const s of submissions as any[]) {
    const sid = String(s.student);
    const row = stats.get(sid) || { graded: 0, pending: 0, scoreSum: 0, recent: [], prior: [] };
    const max = Number(s.assignment?.totalMarks || 0);
    const percentage = max > 0 && typeof s.score === 'number' ? clamp((s.score / max) * 100) : null;
    if (s.status === 'submitted') row.pending += 1;
    if (percentage !== null && (s.status === 'graded' || s.status === 'returned')) {
      row.graded += 1;
      row.scoreSum += percentage;
      const age = Date.now() - new Date(s.submittedAt).getTime();
      (age <= 14 * 24 * 60 * 60 * 1000 ? row.recent : row.prior).push(percentage);
      const aid = String(s.assignment?._id || s.assignment);
      const a = assignmentStats.get(aid) || { title: s.assignment?.title || 'Untitled', sum: 0, count: 0 };
      a.sum += percentage;
      a.count += 1;
      assignmentStats.set(aid, a);

      const cid = String(s.course);
      const course = courseStats.get(cid) || { sum: 0, count: 0 };
      course.sum += percentage;
      course.count += 1;
      courseStats.set(cid, course);
    }
    stats.set(sid, row);
  }

  const studentMetrics = students.map((s: any) => {
    const sid = String(s._id);
    const row = stats.get(sid) || { graded: 0, pending: 0, scoreSum: 0, recent: [], prior: [] };
    const att = attMap.get(sid) || { total: 0, present: 0, late: 0, absent: 0, excused: 0 };
    const average = row.graded ? clamp(row.scoreSum / row.graded) : null;
    const attendance = att.total ? clamp(((att.present + att.late * 0.5) / att.total) * 100) : null;
    const recentAverage = row.recent.length ? row.recent.reduce((a, b) => a + b, 0) / row.recent.length : null;
    const priorAverage = row.prior.length ? row.prior.reduce((a, b) => a + b, 0) / row.prior.length : null;
    const decline = recentAverage !== null && priorAverage !== null ? Math.round(recentAverage - priorAverage) : 0;
    const riskReasons: string[] = [];
    if (average !== null && average < 60) riskReasons.push('low_grade');
    if (attendance !== null && attendance < 75) riskReasons.push('low_attendance');
    if (row.pending >= 2) riskReasons.push('pending_work');
    if (decline <= -10) riskReasons.push('declining');
    const name = s.profile ? `${s.profile.firstName} ${s.profile.lastName}` : s.studentId;
    return { studentId: s._id, name, avatar: s.profile?.avatar || null, average, attendance, graded: row.graded, pending: row.pending, decline, riskReasons };
  });

  const atRiskStudents = studentMetrics.filter((s) => s.riskReasons.length > 0).sort((a, b) => b.riskReasons.length - a.riskReasons.length).slice(0, 10);
  const decliningStudents = studentMetrics.filter((s) => s.decline <= -10).sort((a, b) => a.decline - b.decline).slice(0, 10);
  const difficultAssignments = [...assignmentStats.entries()]
    .filter(([, a]) => a.count >= 2)
    .map(([assignmentId, a]) => ({ assignmentId, title: a.title, average: clamp(a.sum / a.count), submissions: a.count }))
    .sort((a, b) => a.average - b.average).slice(0, 10);

  const coursePerformance = courses.map((course: any) => {
    const row = courseStats.get(String(course._id));
    const average = row?.count ? clamp(row.sum / row.count) : null;
    return { courseId: course._id, title: course.title, status: course.status, average, gradedSubmissions: row?.count || 0 };
  });

  const graded = submissions.filter((s: any) => (s.status === 'graded' || s.status === 'returned') && Number(s.assignment?.totalMarks) > 0 && typeof s.score === 'number');
  const averageGrade = graded.length ? clamp(graded.reduce((sum: number, s: any) => sum + (s.score / Number(s.assignment.totalMarks)) * 100, 0) / graded.length) : null;
  const pendingSubmissions = submissions.filter((s: any) => s.status === 'submitted').length;

  return ApiResponse.success(res, {
    summary: { students: students.length, gradedSubmissions: graded.length, averageGrade, pendingSubmissions },
    atRiskStudents,
    decliningStudents,
    difficultAssignments,
    coursePerformance,
    windowDays: 28,
    note: 'Risk indicators are signals for teacher review, not causal conclusions.',
  });
};
