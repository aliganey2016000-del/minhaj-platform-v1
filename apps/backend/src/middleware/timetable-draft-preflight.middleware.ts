import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { BadRequestError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import ClassModel from '../models/class.model';
import Course from '../models/course.model';
import Teacher from '../models/teacher.model';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function objectIdString(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'object' && value && '_id' in (value as any)) return String((value as any)._id);
  return String(value);
}

export async function preflightTimetableDraft(req: Request, _res: Response, next: NextFunction) {
  const raw = req.body?.entries;
  if (raw === undefined) return next();
  if (!Array.isArray(raw)) throw new BadRequestError('entries must be an array');
  if (raw.length > 5000) throw new BadRequestError('A timetable draft cannot contain more than 5000 entries');

  const schoolId = String(resolveOrgIdForCreate(req, req.body?.school ? String(req.body.school) : undefined) || '');
  if (!schoolId || !mongoose.isValidObjectId(schoolId)) throw new BadRequestError('School is required');

  const entries = raw.map((item: any, index: number) => {
    const cls = objectIdString(item?.class);
    const course = objectIdString(item?.course);
    const teacher = item?.teacher ? objectIdString(item.teacher) : null;
    const dayOfWeek = Number(item?.dayOfWeek);
    const startTime = String(item?.startTime || '').trim();
    const endTime = String(item?.endTime || '').trim();

    if (!mongoose.isValidObjectId(cls)) throw new BadRequestError(`Entry ${index + 1}: valid class is required`);
    if (!mongoose.isValidObjectId(course)) throw new BadRequestError(`Entry ${index + 1}: valid course is required`);
    if (teacher && !mongoose.isValidObjectId(teacher)) throw new BadRequestError(`Entry ${index + 1}: teacher is invalid`);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new BadRequestError(`Entry ${index + 1}: valid day is required`);
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || endTime <= startTime) {
      throw new BadRequestError(`Entry ${index + 1}: valid start/end time is required`);
    }

    return { class: cls, course, teacher };
  });

  const classIds = [...new Set(entries.map((entry) => entry.class))];
  const courseIds = [...new Set(entries.map((entry) => entry.course))];
  const teacherIds = [...new Set(entries.map((entry) => entry.teacher).filter(Boolean) as string[])];

  const [classes, courses, teachers] = await Promise.all([
    classIds.length ? ClassModel.find({ _id: { $in: classIds }, school: schoolId }).select('_id').lean() : Promise.resolve([]),
    courseIds.length ? Course.find({ _id: { $in: courseIds }, school: schoolId }).select('_id class title').lean() : Promise.resolve([]),
    teacherIds.length ? Teacher.find({ _id: { $in: teacherIds }, school: schoolId }).select('_id').lean() : Promise.resolve([]),
  ]);

  if (classes.length !== classIds.length) throw new BadRequestError('One or more timetable classes do not belong to this school');
  if (courses.length !== courseIds.length) throw new BadRequestError('One or more timetable courses do not belong to this school');
  if (teachers.length !== teacherIds.length) throw new BadRequestError('One or more timetable teachers do not belong to this school');

  const courseMap = new Map(courses.map((course: any) => [String(course._id), course]));
  for (const entry of entries) {
    const course: any = courseMap.get(entry.course);
    if (course?.class && String(course.class) !== entry.class) {
      throw new BadRequestError(`${course.title?.en || 'Course'} is assigned to a different class`);
    }
  }

  return next();
}
