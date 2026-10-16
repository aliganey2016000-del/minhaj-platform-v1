process.env.JWT_ACCESS_SECRET = 'guuldoon-progress-access';
process.env.JWT_REFRESH_SECRET = 'guuldoon-progress-refresh';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('guuldoon-my-progress');
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
    const { generateAccessToken } = await import('../utils/jwt');
    const { streakFromDays } = await import('../routes/v1/guuldoon.routes');

    // Streak: consecutive days ending today or yesterday; a gap breaks it.
    const now = new Date('2026-10-14T12:00:00Z');
    assert.equal(streakFromDays(['2026-10-14', '2026-10-13', '2026-10-12'], now), 3);
    assert.equal(streakFromDays(['2026-10-13', '2026-10-12'], now), 2, 'yesterday still counts');
    assert.equal(streakFromDays(['2026-10-11'], now), 0, 'a gap ends the streak');
    assert.equal(streakFromDays([], now), 0);

    const admin = await User.create({ email: 'gd-prog-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({ name: 'Progress School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252600000009', email: 'gd-prog-school@test.local', principalName: 'P', establishedYear: 2020, createdBy: admin._id });
    const classroom = await ClassModel.create({ school: school._id, title: 'Grade 12', room: '12', gradeLevel: 12 });
    const studentUser = await User.create({ email: 'gd-prog-student@test.local', password: 'StudentPassword123!', role: 'student', organizationId: school._id });
    const profile = await Profile.create({ user: studentUser._id, firstName: 'Yuusuf', lastName: 'Test', gender: 'male' });
    await Student.create({ user: studentUser._id, profile: profile._id, studentId: 'GD-PROG-1', school: school._id, class: classroom._id, status: 'active', approvalStatus: 'approved' });
    const course = await Course.create({ title: { en: 'Physics' }, slug: 'guuldoon-physics-progress', scope: 'global', globalGrade: 12, status: 'published', duration: 8, maxStudents: 50 });
    const content = await CourseContent.create({ course: course._id, chapters: [{ title: 'Waves', description: '', order: 0, status: 'published', items: [] }] });
    const chapterId = String(content.chapters[0]._id);
    await Subscription.create({ user: studentUser._id, school: school._id, grade: 12, paymentReference: 'GD-PROG-PAY', verifiedReference: 'GD-PROG-PAY', status: 'approved', startsAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() + 365 * 86400000) });

    const token = (user: any) => generateAccessToken({ userId: String(user._id), role: user.role, organizationId: user.organizationId?.toString(), permissions: [] });
    const adminHeaders = { Authorization: `Bearer ${token(admin)}` };
    const studentHeaders = { Authorization: `Bearer ${token(studentUser)}` };
    const verify = await request(app).post('/api/v1/guuldoon/devices/verify-password').set(studentHeaders).send({ password: 'StudentPassword123!' });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    const cookie = (verify.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    await request(app).post(`/api/v1/guuldoon/courses/${course._id}/open`).set(studentHeaders).set('Cookie', cookie).expect(200);

    const past = await request(app).post(`/api/v1/guuldoon/admin/courses/${course._id}/exams`).set(adminHeaders).send({ year: 2021, durationMin: 120, totalMarks: 100, answerKeyStatus: 'verified', published: true, source: 'National exam' }).expect(201);
    const { default: GuuldoonExam } = await import('../models/guuldoon-past-exam.model');
    const practice = { body: { data: await GuuldoonExam.create({ course: course._id, year: 2022, kind: 'practice', durationMin: 30, totalMarks: 10, answerKeyStatus: 'verified', published: true, source: 'Practice' }) } };
    const mcq = (number: number, exam: string, right: number) => ({ number, type: 'mcq', textSo: `Question ${number}`, options: ['A1', 'B1', 'C1', 'D1'], marks: 2, chapterId, topicTags: [], answer: right, answerStatus: 'verified', explainerText: '' });
    await request(app).post(`/api/v1/guuldoon/admin/exams/${past.body.data._id}/questions/bulk`).set(adminHeaders).send({ questions: [mcq(1, '', 1), mcq(2, '', 2), mcq(3, '', 0)] }).expect(200);
    await request(app).post(`/api/v1/guuldoon/admin/exams/${practice.body.data._id}/questions/bulk`).set(adminHeaders).send({ questions: [mcq(1, '', 3)] }).expect(200);

    const list = await request(app).get(`/api/v1/guuldoon/courses/${course._id}/chapters/${chapterId}/questions?limit=10`).set(studentHeaders).set('Cookie', cookie).expect(200);
    const byNumber = new Map<number, string>(list.body.data.questions.map((question: any) => [question.number, question._id]));
    const answer = (number: number, value: number) => request(app).post(`/api/v1/guuldoon/questions/${byNumber.get(number)}/answer`).set(studentHeaders).set('Cookie', cookie).send({ answer: value }).expect(200);
    assert.equal((await answer(1, 1)).body.data.correct, true);
    assert.equal((await answer(2, 0)).body.data.correct, false);

    // Dashboard: only students, shaped for the page.
    await request(app).get('/api/v1/guuldoon/my-progress').set(adminHeaders).expect(403);
    const progress = (await request(app).get('/api/v1/guuldoon/my-progress').set(studentHeaders).expect(200)).body.data;
    assert.equal(progress.studentName, 'Yuusuf');
    assert.equal(progress.grade, 12);
    assert.equal(progress.answered, 2);
    assert.equal(progress.accuracy, 50);
    assert.equal(progress.streak, 1);
    assert.equal(progress.week.length, 7);
    assert.equal(progress.week[6].n, 2);
    assert.equal(progress.courses.length, 1);
    assert.equal(progress.courses[0].chapters[0].id, chapterId);
    const exam = progress.exams.find((row: any) => row.year === 2021);
    assert.equal(exam.questionCount, 3);
    assert.equal(exam.answered, 2);
    assert.equal(exam.correct, 1);

    // Chapter answers: wrong ones first, each with the student's answer and the key.
    const mine = (await request(app).get(`/api/v1/guuldoon/courses/${course._id}/chapters/${chapterId}/my-answers?kind=past`).set(studentHeaders).set('Cookie', cookie).expect(200)).body.data;
    assert.equal(mine.answered, 2);
    assert.equal(mine.right, 1);
    assert.equal(mine.wrong, 1);
    assert.equal(mine.items[0].correct, false, 'mistakes come first');
    assert.match(mine.items[0].mine, /A1/);
    assert.match(mine.items[0].right, /C1/);
    assert.equal(mine.items[0].answer, undefined, 'the raw answer key is never sent');
    const understand = (await request(app).get(`/api/v1/guuldoon/courses/${course._id}/chapters/${chapterId}/my-answers?kind=understand`).set(studentHeaders).set('Cookie', cookie).expect(200)).body.data;
    assert.equal(understand.answered, 0);

    console.log('Guulgaar my-progress e2e passed');
  } finally {
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
