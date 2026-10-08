process.env.JWT_ACCESS_SECRET = 'guuldoon-core-access';
process.env.JWT_REFRESH_SECRET = 'guuldoon-core-refresh';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('guuldoon-learning-core');
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
    const { default: Mistake } = await import('../models/guuldoon-mistake.model');
    const { generateAccessToken } = await import('../utils/jwt');

    const admin = await User.create({ email: 'gd-core-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Guuldoon Core School',
      organizationType: 'private',
      country: 'Somalia',
      city: 'Mogadishu',
      address: 'Test',
      phone: '+252600000001',
      email: 'gd-core-school@test.local',
      principalName: 'Principal',
      establishedYear: 2020,
      createdBy: admin._id,
    });
    const classroom = await ClassModel.create({ school: school._id, title: 'Grade 12', room: '12', gradeLevel: 12 });
    const studentUser = await User.create({
      email: 'gd-core-student@test.local',
      password: 'StudentPassword123!',
      role: 'student',
      organizationId: school._id,
    });
    const profile = await Profile.create({ user: studentUser._id, firstName: 'Aamino', lastName: 'Test', gender: 'female' });
    const student = await Student.create({
      user: studentUser._id,
      profile: profile._id,
      studentId: 'GD-CORE-001',
      school: school._id,
      class: classroom._id,
      status: 'active',
      approvalStatus: 'approved',
    });
    const course = await Course.create({
      title: { en: 'Physics' },
      slug: 'guuldoon-physics-core',
      scope: 'global',
      globalGrade: 12,
      status: 'published',
      duration: 8,
      maxStudents: 50,
    });
    const content = await CourseContent.create({
      course: course._id,
      chapters: [
        { title: 'Electricity', description: '', order: 0, status: 'published', items: [] },
        { title: 'Waves', description: '', order: 1, status: 'published', items: [] },
      ],
    });
    const chapterId = String(content.chapters[0]._id);
    const waveChapterId = String(content.chapters[1]._id);

    await Subscription.create({
      user: studentUser._id,
      school: school._id,
      grade: 12,
      paymentReference: 'GD-CORE-PAY-1',
      verifiedReference: 'GD-CORE-PAY-1',
      status: 'approved',
      startsAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() + 365 * 86400000),
    });

    const token = (user: any) => generateAccessToken({
      userId: String(user._id),
      role: user.role,
      organizationId: user.organizationId?.toString(),
      permissions: [],
    });
    const adminHeaders = { Authorization: `Bearer ${token(admin)}` };
    const studentHeaders = { Authorization: `Bearer ${token(studentUser)}` };

    const verify = await request(app)
      .post('/api/v1/guuldoon/devices/verify-password')
      .set(studentHeaders)
      .send({ password: 'StudentPassword123!' });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    const setCookies = verify.headers['set-cookie'] as unknown as string[];
    const deviceCookie = setCookies[0].split(';')[0];

    const opened = await request(app)
      .post(`/api/v1/guuldoon/courses/${course._id}/open`)
      .set(studentHeaders)
      .set('Cookie', deviceCookie);
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.match(opened.body.data.destination, /guuldoon\/courses/);

    const saveConfig = await request(app)
      .put(`/api/v1/guuldoon/admin/courses/${course._id}/config`)
      .set(adminHeaders)
      .send({
        passTarget: 70,
        chapterWeights: [
          { chapterId, examWeight: 60 },
          { chapterId: waveChapterId, examWeight: 40 },
        ],
        glossary: [{ termSo: 'Iska-caabin', termEn: 'Resistance', termAr: 'المقاومة' }],
      });
    assert.equal(saveConfig.status, 200, JSON.stringify(saveConfig.body));

    const createdExam = await request(app)
      .post(`/api/v1/guuldoon/admin/courses/${course._id}/exams`)
      .set(adminHeaders)
      .send({ year: 2021, durationMin: 120, totalMarks: 100, answerKeyStatus: 'verified', published: true, source: 'National exam' });
    assert.equal(createdExam.status, 201, JSON.stringify(createdExam.body));
    const examId = createdExam.body.data._id;

    const importQuestions = await request(app)
      .post(`/api/v1/guuldoon/admin/exams/${examId}/questions/bulk`)
      .set(adminHeaders)
      .send({
        questions: [
          { number: 1, type: 'mcq', textSo: 'Resistance unit?', options: ['Volt', 'Ohm', 'Ampere', 'Watt'], marks: 2, chapterId, topicTags: ['resistance'], answer: 1, answerStatus: 'verified', explainerText: 'Resistance waxaa lagu cabbiraa Ohm.' },
          { number: 2, type: 'structured', textSo: 'Sharax wave.', marks: 4, chapterId: waveChapterId, topicTags: ['waves'], answerStatus: 'pending' },
        ],
      });
    assert.equal(importQuestions.status, 200, JSON.stringify(importQuestions.body));

    const experience = await request(app)
      .get(`/api/v1/guuldoon/courses/${course._id}/experience`)
      .set(studentHeaders)
      .set('Cookie', deviceCookie);
    assert.equal(experience.status, 200, JSON.stringify(experience.body));
    assert.equal(experience.body.data.course.grade, 12);
    assert.equal(experience.body.data.chapters.length, 2);
    assert.equal(experience.body.data.chapters[0].examWeight, 60);
    assert.equal(experience.body.data.glossary[0].termEn, 'Resistance');
    assert.equal(experience.body.data.exams[0].year, 2021);

    const exam = await request(app)
      .get(`/api/v1/guuldoon/courses/${course._id}/exams/${examId}`)
      .set(studentHeaders)
      .set('Cookie', deviceCookie);
    assert.equal(exam.status, 200, JSON.stringify(exam.body));
    assert.equal(exam.body.data.questions.length, 2);
    assert.equal(exam.body.data.questions[0].answer, undefined);
    const q1 = exam.body.data.questions.find((q: any) => q.number === 1);
    const q2 = exam.body.data.questions.find((q: any) => q.number === 2);

    const wrong = await request(app)
      .post(`/api/v1/guuldoon/questions/${q1._id}/answer`)
      .set(studentHeaders)
      .set('Cookie', deviceCookie)
      .send({ answer: 0, timeMs: 2500 });
    assert.equal(wrong.status, 200, JSON.stringify(wrong.body));
    assert.equal(wrong.body.data.marked, true);
    assert.equal(wrong.body.data.correct, false);
    assert.equal(await Mistake.countDocuments({ user: studentUser._id, question: q1._id }), 1);

    const correct = await request(app)
      .post(`/api/v1/guuldoon/questions/${q1._id}/answer`)
      .set(studentHeaders)
      .set('Cookie', deviceCookie)
      .send({ answer: 1, timeMs: 1800 });
    assert.equal(correct.status, 200);
    assert.equal(correct.body.data.correct, true);
    const progressedMistake = await Mistake.findOne({ user: studentUser._id, question: q1._id }).lean();
    assert.equal(progressedMistake?.box, 2);

    const pending = await request(app)
      .post(`/api/v1/guuldoon/questions/${q2._id}/answer`)
      .set(studentHeaders)
      .set('Cookie', deviceCookie)
      .send({ answer: 'A wave transfers energy.' });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.data.marked, false);
    assert.equal(pending.body.data.correct, null);

    const practice = await request(app)
      .get(`/api/v1/guuldoon/courses/${course._id}/chapters/${chapterId}/questions`)
      .set(studentHeaders)
      .set('Cookie', deviceCookie);
    assert.equal(practice.status, 200);
    assert.equal(practice.body.data.questions.length, 1);
    assert.equal(practice.body.data.questions[0].answer, undefined);

    const refreshed = await request(app)
      .get(`/api/v1/guuldoon/courses/${course._id}/experience`)
      .set(studentHeaders)
      .set('Cookie', deviceCookie);
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.body.data.passMeter > 0);
    assert.ok(refreshed.body.data.mistakeSummary.total >= 1);

    console.log('Guuldoon learning core: access, builder, exams, question-first marking, Pass Meter and mistakes passed.');
  } finally {
    await db.stop();
  }
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
