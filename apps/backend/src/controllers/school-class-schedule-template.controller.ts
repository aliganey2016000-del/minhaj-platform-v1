import { Request, Response } from 'express';
import ClassSchedule from '../models/class-schedule.model';
import Course from '../models/course.model';
import School, { resolveInstitutionType } from '../models/school.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HEADERS = [
  'Class / Section',
  'Course / Subject',
  'Teacher / Instructor',
  'Day',
  'Time',
  'Status',
];

const CANDIDATE_SLOTS = [
  ['08:00', '08:45'],
  ['09:00', '09:45'],
  ['10:00', '10:45'],
  ['11:00', '11:45'],
  ['12:00', '12:45'],
  ['13:00', '13:45'],
  ['14:00', '14:45'],
  ['15:00', '15:45'],
  ['16:00', '16:45'],
];

function classLabel(cls: any): string {
  if (!cls) return '';
  return `${cls.title || ''}${cls.section ? ` — ${cls.section}` : ''}`.trim();
}

function teacherIdentifier(teacher: any): string {
  if (!teacher) return '';
  const email = teacher.user?.email || '';
  if (email) return email;
  if (teacher.teacherId) return teacher.teacherId;
  const fullName = `${teacher.profile?.firstName || ''} ${teacher.profile?.lastName || ''}`.trim();
  return fullName;
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

async function resolveSchool(req: Request) {
  const schoolId = String(resolveOrgIdForCreate(req, req.query.school as string | undefined) || '');
  if (!schoolId) throw new BadRequestError('School is required');
  const school = await School.findById(schoolId).lean();
  if (!school) throw new NotFoundError('School not found');
  if (resolveInstitutionType(school as any) !== 'school') {
    throw new BadRequestError('This simplified schedule template is only available for schools');
  }
  return schoolId;
}

/**
 * Generates a test-ready school schedule template from REAL course data in the
 * current school. This avoids dummy values such as teacher@example.com that
 * cannot pass the importer. Course Code is preferred because it is the most
 * reliable identifier; the assigned teacher's real email is used when present.
 *
 * If the chosen course already has a schedule, the sample row mirrors that
 * exact schedule so re-import safely updates it. Otherwise the controller finds
 * the first class/teacher conflict-free 45-minute slot. When every candidate is
 * occupied, the sample is emitted Inactive so it can still be imported without
 * a conflict and edited later.
 */
export const downloadSchoolTemplate = async (req: Request, res: Response): Promise<void> => {
  const schoolId = await resolveSchool(req);

  const course = await Course.findOne({ school: schoolId, class: { $ne: null } })
    .populate('class', 'title section')
    .populate({
      path: 'teacher',
      select: 'teacherId user profile',
      populate: [
        { path: 'user', select: 'email' },
        { path: 'profile', select: 'firstName lastName' },
      ],
    })
    .sort({ createdAt: -1 })
    .lean() as any;

  const rows: Array<Array<string>> = [];

  if (course?.class) {
    const existing = await ClassSchedule.findOne({
      school: schoolId,
      class: course.class._id,
      course: course._id,
    })
      .populate({
        path: 'teacher',
        select: 'teacherId user profile',
        populate: [
          { path: 'user', select: 'email' },
          { path: 'profile', select: 'firstName lastName' },
        ],
      })
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean() as any;

    let dayOfWeek = existing?.dayOfWeek ?? 0;
    let startTime = existing?.startTime || '';
    let endTime = existing?.endTime || '';
    let status = existing ? (existing.isActive ? 'Active' : 'Inactive') : 'Active';
    const teacher = existing?.teacher || course.teacher || null;

    if (!existing) {
      const conflictFilter: Record<string, any> = {
        school: schoolId,
        isActive: true,
        $or: [{ class: course.class._id }],
      };
      if (teacher?._id) conflictFilter.$or.push({ teacher: teacher._id });

      const busy = await ClassSchedule.find(conflictFilter)
        .select('dayOfWeek startTime endTime')
        .lean() as any[];

      let selected: { dayOfWeek: number; startTime: string; endTime: string } | null = null;
      for (let day = 0; day < DAYS.length && !selected; day += 1) {
        for (const [start, end] of CANDIDATE_SLOTS) {
          const blocked = busy.some((item) =>
            item.dayOfWeek === day && overlaps(start, end, item.startTime, item.endTime)
          );
          if (!blocked) {
            selected = { dayOfWeek: day, startTime: start, endTime: end };
            break;
          }
        }
      }

      if (selected) {
        dayOfWeek = selected.dayOfWeek;
        startTime = selected.startTime;
        endTime = selected.endTime;
      } else {
        dayOfWeek = 0;
        startTime = '08:00';
        endTime = '08:45';
        status = 'Inactive';
      }
    }

    rows.push([
      classLabel(course.class),
      course.courseCode || course.title?.en || '',
      teacherIdentifier(teacher),
      DAYS[dayOfWeek] || 'Sunday',
      `${startTime} - ${endTime}`,
      status,
    ]);
  }

  const buffer = buildXlsxBuffer(HEADERS, rows, 'School Schedule Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=school-class-schedules-template.xlsx');
  res.end(buffer);
};
