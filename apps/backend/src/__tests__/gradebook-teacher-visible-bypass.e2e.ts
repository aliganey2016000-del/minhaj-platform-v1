/**
 * Round 11 audit finding: a grading category an admin marks
 * `teacherVisible: false` (e.g. an official invigilated exam score a
 * teacher should not be able to touch) was enforced by
 * bulkSetManualGrades (the "Enter Results" sheet) and
 * importManualEntryRoster (the xlsx import), but NOT by the single-entry
 * endpoint PUT /gradebook/:courseId/manual/:studentId — a teacher could
 * call that endpoint directly with the locked category's key and silently
 * overwrite the admin-controlled score, corrupting the student's weighted
 * grade. Fixed in gradebook.controller.ts's setManualGrade: a teacher
 * caller is now rejected with 403 when the target category is
 * teacherVisible: false, same as the bulk paths. admin/org_admin are
 * unaffected (they can always write every category).
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('gradebook-teacher-visible-bypass');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Student } = await import('../models/student.model');
    const { default: GradingScheme } = await import('../models/grading-scheme.model');
    const { default: ManualGradeEntry } = await import('../models/manual-grade-entry.model');

    const token = (user: any) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions: [],
      organizationId: user.organizationId ? user.organizationId.toString() : undefined,
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const admin = await User.create({ email: 'gtv-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'GTV School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St',
      phone: '+000', email: 'gtv-school@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const adminToken = token(admin);

    const teacherUser = await User.create({ email: 'gtv-teacher@test.local', password: 'Password123!', role: 'teacher', organizationId: school._id });
    const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'T', lastName: 'T', gender: 'male' });
    const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id });
    const teacherToken = token(teacherUser);

    const course = await Course.create({
      title: { en: 'GTV Course' }, slug: 'gtv-course', category: 'general', level: 'beginner', duration: 8,
      maxStudents: 10, school: school._id, teacher: teacher._id, status: 'published', enrolledStudents: 0,
    });

    const studentUser = await User.create({ email: 'gtv-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
    const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'S', lastName: 'S', gender: 'female' });
    const student = await Student.create({ user: studentUser._id, profile: studentProfile._id, school: school._id, enrolledCourses: [course._id] });

    // A locked category (admin-only) and an open one (teacher may fill it in).
    await GradingScheme.create({
      course: course._id,
      categories: [
        { key: 'final_exam', label: 'Final Exam', weight: 60, sourceType: 'manual', teacherVisible: false },
        { key: 'participation', label: 'Participation', weight: 40, sourceType: 'manual', teacherVisible: true },
      ],
      passingScore: 60,
    });

    section('Direct single-entry endpoint rejects a teacher writing to a teacherVisible:false category');
    const lockedRes = await request(app)
      .put(`/api/v1/gradebook/${course._id}/manual/${student._id}`)
      .set(auth(teacherToken))
      .send({ categoryKey: 'final_exam', score: 99 });
    assert(lockedRes.status === 403, `teacher is rejected with 403 (got ${lockedRes.status})`);
    const lockedEntry = await ManualGradeEntry.findOne({ course: course._id, student: student._id, categoryKey: 'final_exam' }).lean();
    assert(!lockedEntry, 'no ManualGradeEntry was written for the locked category');

    section('Direct single-entry endpoint still allows a teacher writing to a teacherVisible:true category');
    const openRes = await request(app)
      .put(`/api/v1/gradebook/${course._id}/manual/${student._id}`)
      .set(auth(teacherToken))
      .send({ categoryKey: 'participation', score: 88 });
    assert(openRes.status === 200, `teacher succeeds on the open category (got ${openRes.status})`);
    const openEntry = await ManualGradeEntry.findOne({ course: course._id, student: student._id, categoryKey: 'participation' }).lean();
    assert(openEntry?.score === 88, `the open category's score was saved (got ${openEntry?.score})`);

    section('admin is never blocked by teacherVisible on the single-entry endpoint');
    const adminRes = await request(app)
      .put(`/api/v1/gradebook/${course._id}/manual/${student._id}`)
      .set(auth(adminToken))
      .send({ categoryKey: 'final_exam', score: 95 });
    assert(adminRes.status === 200, `admin succeeds on the locked category (got ${adminRes.status})`);
    const adminEntry = await ManualGradeEntry.findOne({ course: course._id, student: student._id, categoryKey: 'final_exam' }).lean();
    assert(adminEntry?.score === 95, `admin's score was saved (got ${adminEntry?.score})`);

    section('Control: bulkSetManualGrades already enforced this (regression guard, not the bug itself)');
    const bulkRes = await request(app)
      .post(`/api/v1/gradebook/${course._id}/manual-entry-roster/bulk`)
      .set(auth(teacherToken))
      .send({ entries: [{ studentId: student._id.toString(), slot: 'final', score: 10 }] });
    // final_exam's label "Final Exam" + sourceType 'manual' doesn't match the
    // 'final' slot matcher (which requires sourceType !== 'exam' AND keyword
    // "final" — it does match on label, but matchCategoryForSlot still skips
    // it for a teacher since teacherVisible is false), so nothing is saved —
    // the admin's 95 from above must survive untouched.
    assert(bulkRes.status === 200, `bulk endpoint call succeeds (got ${bulkRes.status})`);
    const afterBulk = await ManualGradeEntry.findOne({ course: course._id, student: student._id, categoryKey: 'final_exam' }).lean();
    assert(afterBulk?.score === 95, `locked category's score (95, set by admin) is untouched by the teacher's bulk call (got ${afterBulk?.score})`);
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll gradebook teacherVisible bypass checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
