process.env.JWT_ACCESS_SECRET = 'guuldoon-challenge-access';
process.env.JWT_REFRESH_SECRET = 'guuldoon-challenge-refresh';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('guuldoon-challenge');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Student } = await import('../models/student.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Course } = await import('../models/course.model');
    const { default: CourseContent } = await import('../models/course-content.model');
    const { default: Subscription } = await import('../models/global-subscription.model');
    const { default: GuuldoonExam } = await import('../models/guuldoon-past-exam.model');
    const { default: Notification } = await import('../models/notification.model');
    const { generateAccessToken } = await import('../utils/jwt');

    const admin = await User.create({ email: 'gd-ch-admin@test.local', password: 'Password123!', role: 'admin' });
    const mkSchool = (n: string) => School.create({ name: `Challenge ${n}`, organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+2526000000' + (n === 'A' ? '31' : '32'), email: `gd-ch-${n}@test.local`, principalName: 'P', establishedYear: 2020, createdBy: admin._id });
    const school = await mkSchool('A');
    const otherSchool = await mkSchool('B');
    const classroom = await ClassModel.create({ school: school._id, title: 'Grade 12', room: '12', gradeLevel: 12 });
    const otherClass = await ClassModel.create({ school: otherSchool._id, title: 'Other 12', room: '12', gradeLevel: 12 });

    const mkStudent = async (tag: string, cls = classroom, sch = school) => {
      const user = await User.create({ email: `gd-ch-${tag}@test.local`, password: 'StudentPassword123!', role: 'student', organizationId: sch._id });
      const profile = await Profile.create({ user: user._id, firstName: tag, lastName: 'Test', gender: 'male' });
      await Student.create({ user: user._id, profile: profile._id, studentId: `GD-CH-${tag}`, school: sch._id, class: cls._id, status: 'active', approvalStatus: 'approved' });
      await Subscription.create({ user: user._id, school: sch._id, grade: 12, paymentReference: `GD-CH-PAY-${tag}`, verifiedReference: `GD-CH-PAY-${tag}`, status: 'approved', startsAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() + 365 * 86400000) });
      return user;
    };
    const ali = await mkStudent('Ali');
    const bile = await mkStudent('Bile');
    const outsider = await mkStudent('Out', otherClass, otherSchool);
    const teacher = await User.create({ email: 'gd-ch-teacher@test.local', password: 'Password123!', role: 'teacher', organizationId: school._id });
    const otherTeacher = await User.create({ email: 'gd-ch-teacher2@test.local', password: 'Password123!', role: 'teacher', organizationId: school._id });

    const course = await Course.create({ title: { en: 'Chemistry' }, slug: 'guuldoon-chem-challenge', scope: 'global', globalGrade: 12, status: 'published', duration: 8, maxStudents: 50 });
    const content = await CourseContent.create({ course: course._id, chapters: [{ title: 'Rates', description: '', order: 0, status: 'published', items: [] }] });
    const chapterId = String(content.chapters[0]._id);

    const token = (user: any) => generateAccessToken({ userId: String(user._id), role: user.role, organizationId: user.organizationId?.toString(), permissions: [] });
    const H = (user: any) => ({ Authorization: `Bearer ${token(user)}` });
    const adminHeaders = H(admin);

    const past = await request(app).post(`/api/v1/guuldoon/admin/courses/${course._id}/exams`).set(adminHeaders).send({ year: 2023, durationMin: 120, totalMarks: 100, answerKeyStatus: 'verified', published: true, source: 'National' }).expect(201);
    const mcq = (number: number, right: number) => ({ number, type: 'mcq', textSo: `Question ${number}`, options: ['A1', 'B1', 'C1', 'D1'], marks: 2, chapterId, topicTags: [], answer: right, answerStatus: 'verified', explainerText: '' });
    await request(app).post(`/api/v1/guuldoon/admin/exams/${past.body.data._id}/questions/bulk`).set(adminHeaders).send({ questions: [mcq(1, 1), mcq(2, 2), mcq(3, 0)] }).expect(200);
    await GuuldoonExam.updateOne({ _id: past.body.data._id }, { $set: { published: true } });

    // Options: courses with chapters and exams, only this school's classes.
    const options = (await request(app).get('/api/v1/guuldoon-challenges/options').set(H(teacher)).expect(200)).body.data;
    assert.equal(options.classes.length, 1);
    assert.equal(options.courses[0].chapters[0].id, chapterId);
    assert.equal(options.courses[0].exams.length, 1);
    assert.equal(options.courses[0].exams[0].questions, 3, 'exam cards show their question count');
    assert.equal(options.courses[0].chapters[0].past, 3);
    assert.equal(options.courses[0].language, 'en');
    const preview = (await request(app).post('/api/v1/guuldoon-challenges/preview').set(H(teacher)).send({ courseId: String(course._id), chapterIds: [chapterId], sources: ['past'], examIds: [options.courses[0].exams[0].id] }).expect(200)).body.data;
    assert.equal(preview.questions, 3, 'the same questions are not counted twice');
    await request(app).get('/api/v1/guuldoon-challenges/options').set(H(ali)).expect(403);

    // Validation
    const base = { title: 'Cutubka 1', courseId: String(course._id), chapterIds: [chapterId], sources: ['past'], classIds: [String(classroom._id)] };
    await request(app).post('/api/v1/guuldoon-challenges').set(H(teacher)).send({ ...base, title: '' }).expect(400);
    await request(app).post('/api/v1/guuldoon-challenges').set(H(teacher)).send({ ...base, classIds: [String(otherClass._id)] }).expect(400);
    await request(app).post('/api/v1/guuldoon-challenges').set(H(teacher)).send({ ...base, sources: ['understand'] }).expect(400);
    await request(app).post('/api/v1/guuldoon-challenges').set(H(teacher)).send({ ...base, deadline: '2001-01-01' }).expect(400);
    await request(app).post('/api/v1/guuldoon-challenges').set(H(ali)).send(base).expect(403);

    const created = await request(app).post('/api/v1/guuldoon-challenges').set(H(teacher)).send({ ...base, deadline: new Date(Date.now() + 86400000).toISOString() }).expect(201);
    const id = created.body.data.id;
    assert.equal(created.body.data.questions, 3);
    assert.equal(created.body.data.students, 2);
    assert.equal(await Notification.countDocuments({ user: ali._id, title: 'Tartan cusub' }), 1);
    assert.equal(await Notification.countDocuments({ user: outsider._id }), 0, 'other schools are never notified');

    // Students answer: Ali 2 of 3 (one wrong); Bile nothing.
    const verify = await request(app).post('/api/v1/guuldoon/devices/verify-password').set(H(ali)).send({ password: 'StudentPassword123!' });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    const cookie = (verify.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    await request(app).post(`/api/v1/guuldoon/courses/${course._id}/open`).set(H(ali)).set('Cookie', cookie).expect(200);
    const list = await request(app).get(`/api/v1/guuldoon/courses/${course._id}/chapters/${chapterId}/questions?limit=10`).set(H(ali)).set('Cookie', cookie).expect(200);
    const byNumber = new Map<number, string>(list.body.data.questions.map((q: any) => [q.number, q._id]));
    const answer = (n: number, value: number) => request(app).post(`/api/v1/guuldoon/questions/${byNumber.get(n)}/answer`).set(H(ali)).set('Cookie', cookie).send({ answer: value }).expect(200);
    await answer(1, 1);
    await answer(2, 0);

    const mine = (await request(app).get('/api/v1/guuldoon-challenges/mine/list').set(H(ali)).expect(200)).body.data;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].done, 2);
    assert.equal(mine[0].total, 3);
    assert.equal((await request(app).get('/api/v1/guuldoon-challenges/mine/list').set(H(outsider)).expect(200)).body.data.length, 0);

    const results = (await request(app).get(`/api/v1/guuldoon-challenges/${id}/results`).set(H(teacher)).expect(200)).body.data;
    assert.equal(results.summary.students, 2);
    assert.equal(results.summary.mid, 1);
    assert.equal(results.summary.none, 1);
    assert.equal(results.summary.done, 0);
    const aliRow = results.students.find((s: any) => s.name.startsWith('Ali'));
    assert.equal(aliRow.answered, 2);
    assert.equal(aliRow.accuracy, 50);
    const q2 = results.questions.find((q: any) => q.number === 2);
    assert.equal(q2.accuracy, 0);
    assert.match(q2.right, /C1/);
    assert.ok(q2.spread.some((entry: any) => /A1/.test(entry.answer)));
    assert.equal(results.reteach.weakStudents.length, 1, 'only the student who did not start (Ali is at 50%, not below)');

    // Per-student view, scoped to the challenge.
    const detail = (await request(app).get(`/api/v1/guuldoon-challenges/${id}/students/${ali._id}`).set(H(teacher)).expect(200)).body.data;
    assert.equal(detail.answered, 2);
    assert.equal(detail.items[0].correct, false, 'mistakes first');
    assert.equal(detail.items[0].answer, undefined, 'the raw key is never sent');
    await request(app).get(`/api/v1/guuldoon-challenges/${id}/students/${outsider._id}`).set(H(teacher)).expect(404);

    // Other teachers and other schools cannot see it.
    await request(app).get(`/api/v1/guuldoon-challenges/${id}/results`).set(H(otherTeacher)).expect(404);
    await request(app).get(`/api/v1/guuldoon-challenges/${id}/results`).set(H(ali)).expect(403);
    assert.equal((await request(app).get('/api/v1/guuldoon-challenges').set(H(otherTeacher)).expect(200)).body.data.length, 0);
    const listed = (await request(app).get('/api/v1/guuldoon-challenges').set(H(teacher)).expect(200)).body.data;
    assert.equal(listed[0].started, 1);

    // Reminders go only to students who have not finished.
    const reminded = (await request(app).post(`/api/v1/guuldoon-challenges/${id}/remind`).set(H(teacher)).send({}).expect(200)).body.data;
    assert.equal(reminded.sent, 2);
    assert.equal(await Notification.countDocuments({ title: 'Xusuusin tartan' }), 2);

    // Closing hides it from students.
    await request(app).patch(`/api/v1/guuldoon-challenges/${id}`).set(H(teacher)).send({ status: 'closed' }).expect(200);
    assert.equal((await request(app).get('/api/v1/guuldoon-challenges/mine/list').set(H(ali)).expect(200)).body.data.length, 0);

    // Super Admin: works across schools, can reach every school's class of the grade.
    const adminOptions = (await request(app).get('/api/v1/guuldoon-challenges/options').set(adminHeaders).expect(200)).body.data;
    assert.equal(adminOptions.platformWide, true);
    assert.equal(adminOptions.classes.length, 2);
    assert.ok(adminOptions.classes.every((entry: any) => entry.school), 'the school name is shown to the Super Admin');
    const platform = await request(app).post('/api/v1/guuldoon-challenges').set(adminHeaders).send({ title: 'Dhammaan iskuullada', courseId: String(course._id), chapterIds: [chapterId], sources: ['past'], allSchools: true }).expect(201);
    assert.equal(platform.body.data.students, 3, 'both schools are included');
    assert.equal(await Notification.countDocuments({ user: outsider._id, title: 'Tartan cusub' }), 1);
    const platformResults = (await request(app).get(`/api/v1/guuldoon-challenges/${platform.body.data.id}/results`).set(adminHeaders).expect(200)).body.data;
    assert.equal(platformResults.summary.students, 3);
    assert.equal((await request(app).get('/api/v1/guuldoon-challenges/mine/list').set(H(outsider)).expect(200)).body.data.length, 1, 'a student of another school sees it');
    await request(app).get(`/api/v1/guuldoon-challenges/${platform.body.data.id}/results`).set(H(teacher)).expect(404);
    assert.equal((await request(app).get('/api/v1/guuldoon-challenges').set(H(teacher)).expect(200)).body.data.length, 1, 'a teacher does not see the platform challenge');
    await request(app).post('/api/v1/guuldoon-challenges').set(adminHeaders).send({ title: 'x', courseId: String(course._id), chapterIds: [chapterId], sources: ['past'], classIds: [] }).expect(400);

    console.log('Guulgaar challenge e2e passed');
  } finally {
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
