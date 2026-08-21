import assert from 'node:assert/strict';
import {
  assertTeacherOwnsCourse,
  assertTeacherOwnsSubmission,
  assertCanAccessStudent,
} from '../utils/tenant-scope';
import Teacher from '../models/teacher.model';
import Course from '../models/course.model';

const originalTeacherFindOne = (Teacher as any).findOne;
const originalCourseExists = (Course as any).exists;

const teacherId = '507f1f77bcf86cd799439011';
const ownedCourseId = '507f1f77bcf86cd799439012';
const foreignCourseId = '507f1f77bcf86cd799439013';

const teacherReq = {
  user: { role: 'teacher', userId: 'user-teacher-1' },
} as any;

try {
  (Teacher as any).findOne = async () => ({ _id: teacherId });

  let requestedCourseId: string | undefined;
  let requestedTeacherId: string | undefined;
  (Course as any).exists = async (filter: any) => {
    requestedCourseId = filter._id?.toString();
    requestedTeacherId = filter.teacher?.toString();
    return requestedCourseId === ownedCourseId && requestedTeacherId === teacherId ? { _id: ownedCourseId } : null;
  };

  await assertTeacherOwnsCourse(teacherReq, ownedCourseId);
  assert.equal(requestedCourseId, ownedCourseId);
  assert.equal(requestedTeacherId, teacherId);

  await assert.rejects(
    () => assertTeacherOwnsCourse(teacherReq, foreignCourseId),
    /only manage courses assigned to you/
  );

  await assertTeacherOwnsSubmission(teacherReq, { course: ownedCourseId });
  await assert.rejects(
    () => assertTeacherOwnsSubmission(teacherReq, { course: foreignCourseId }),
    /only manage courses assigned to you/
  );

  const studentReq = {
    user: { role: 'teacher', userId: 'user-teacher-1' },
  } as any;

  (Course as any).exists = async (filter: any) =>
    filter.teacher?.toString() === teacherId && filter._id?.$in?.includes(ownedCourseId);

  await assertCanAccessStudent(studentReq, {
    _id: '507f1f77bcf86cd799439014',
    enrolledCourses: [ownedCourseId],
  });

  await assert.rejects(
    () => assertCanAccessStudent(studentReq, {
      _id: '507f1f77bcf86cd799439015',
      enrolledCourses: [foreignCourseId],
    }),
    /only access students enrolled in your own courses/
  );

  console.log('teacher-authz: all ownership regression checks passed');
} finally {
  (Teacher as any).findOne = originalTeacherFindOne;
  (Course as any).exists = originalCourseExists;
}
