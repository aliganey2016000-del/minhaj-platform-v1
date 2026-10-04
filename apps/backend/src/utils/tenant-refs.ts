/**
 * Cross-tenant reference guard.
 *
 * Ids sent by a client (a class's teacher or course, a course's teacher or
 * class) are only ever trusted after proving they belong to the same school
 * as the record being written. Without it an organization admin could link
 * their record to another school's teacher or class, which then appears in
 * (and can read through) that other school's own screens and rosters.
 */

import mongoose from 'mongoose';
import Teacher from '../models/teacher.model';
import ClassModel from '../models/class.model';
import Course from '../models/course.model';
import Student from '../models/student.model';
import { BadRequestError } from './api-error';

const blank = (value: unknown) => value === undefined || value === null || value === '';

async function assertOwned(
  value: unknown,
  schoolId: unknown,
  label: string,
  exists: (id: string, school: string) => Promise<unknown>,
): Promise<void> {
  if (blank(value)) return;
  const id = String(value);
  if (!mongoose.isValidObjectId(id)) throw new BadRequestError(`Invalid ${label}.`);
  if (!schoolId) return; // a platform-level record has no school to compare with
  if (!(await exists(id, String(schoolId)))) {
    throw new BadRequestError(`The selected ${label} does not belong to this organization.`);
  }
}

export async function assertTeacherInSchool(teacher: unknown, schoolId: unknown): Promise<void> {
  await assertOwned(teacher, schoolId, 'teacher', (id, school) => Teacher.exists({ _id: id, school }));
}

export async function assertClassInSchool(classId: unknown, schoolId: unknown): Promise<void> {
  await assertOwned(classId, schoolId, 'class', (id, school) => ClassModel.exists({ _id: id, school }));
}

export async function assertCourseInSchool(course: unknown, schoolId: unknown): Promise<void> {
  await assertOwned(course, schoolId, 'course', (id, school) => Course.exists({ _id: id, school }));
}

/** Every listed student must belong to `schoolId` (skipped for a school-less record). */
export async function assertStudentsInSchool(studentIds: unknown[], schoolId: unknown): Promise<void> {
  const ids = [...new Set(studentIds.map((id) => String(id ?? '')))];
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new BadRequestError('Invalid student id.');
  if (!schoolId || ids.length === 0) return;
  const matching = await Student.countDocuments({ _id: { $in: ids }, school: schoolId as any });
  if (matching !== ids.length) throw new BadRequestError('Every student must belong to the same organization as this record.');
}
