process.env.JWT_ACCESS_SECRET = 'guuldoon-builder-access';
process.env.JWT_REFRESH_SECRET = 'guuldoon-builder-refresh';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { startTestDb } from './support/test-db';

const LIST_ROWS = [
  ['mcq', 'video', 'so', 'ltr', 'verified', 'draft'],
  ['structured', 'audio', 'en', 'rtl', 'pending', 'published'],
  ['fill', 'pdf', 'ar', 'auto', '', ''],
  ['match', 'book', '', '', '', ''],
  ['', 'image', '', '', '', ''],
  ['', 'note', '', '', '', ''],
  ['', 'link', '', '', '', ''],
];

const QUESTION_HEADERS = ['row_status', 'question_id', 'exam_id', 'chapter_id', 'parent_id', 'number', 'type', 'language', 'direction', 'text', 'text_en', 'marks', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'answer_status', 'topic_tags', 'figure_files', 'resource_id', 'explainer_text', 'explainer_audio', 'book_page_from', 'book_page_to', 'book_anchor_text', 'book_relation', 'similar_question_1', 'similar_question_2', 'notes', 'answer_type', 'accepted_answers', 'tolerance_pct', 'unit'];

function question(id: string, exam: string, chapter: string, number: number, type: string, text: string, extra: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    question_id: id, exam_id: exam, chapter_id: chapter, number, type, language: 'en', direction: 'ltr', text, marks: 2,
    answer_status: 'verified', topic_tags: 'topic', ...extra,
  };
  return QUESTION_HEADERS.map(header => row[header] ?? '');
}

async function workbook(variant: 'first' | 'second') {
  const wb = new ExcelJS.Workbook();
  const add = (name: string, headers: string[], rows: any[][]) => {
    const sheet = wb.addWorksheet(name);
    sheet.addRow(headers);
    rows.forEach(row => sheet.addRow(row));
  };
  add('Subjects',
    ['row_status', 'subject_id', 'grade', 'language', 'name_so', 'name_en', 'name_ar', 'description_so', 'description_en', 'status'],
    [['', 'ARB12', 12, 'ar', '', 'Arabic', 'العربية', '', 'Exam preparation', 'published']]);
  add('Chapters',
    ['row_status', 'chapter_id', 'subject_id', 'order', 'title_so', 'title_en', 'title_ar', 'exam_weight', 'status'],
    [
      ['', 'ARB12_CH01', 'ARB12', 1, '', variant === 'first' ? 'Nominal sentence' : 'Nominal sentence (Excel v2)', 'الجملة الاسمية', 60, 'published'],
      ['', 'ARB12_CH02', 'ARB12', 2, '', 'Verbal sentence', 'الجملة الفعلية', 40, 'published'],
    ]);
  add('Exams',
    ['row_status', 'exam_id', 'subject_id', 'year', 'duration_min', 'total_marks', 'source', 'answer_key_status', 'published', 'notes', 'kind'],
    [
      ['', 'ARB12_EX2021', 'ARB12', 2021, 120, 100, 'National', 'verified', true, '', 'past'],
      ['', 'ARB12_PRACTICE', 'ARB12', 2030, 60, 50, 'Practice', 'verified', true, '', 'practice'],
    ]);
  add('Resources',
    ['row_status', 'resource_id', 'subject_id', 'chapter_id', 'type', 'title', 'url', 'file_name', 'page_from', 'page_to', 'language', 'direction', 'offline_available', 'content_text'],
    [
      ['', 'ARB12_RES1', 'ARB12', 'ARB12_CH01', 'note', 'Mubtada and khabar', '', '', 1, 3, 'ar', 'rtl', true, variant === 'first' ? 'Original lesson text' : 'Excel v2 lesson text'],
      ['', 'ARB12_RES2', 'ARB12', 'ARB12_CH01', 'note', 'Kana and sisters', '', '', 4, 6, 'ar', 'rtl', true, variant === 'first' ? 'Second lesson' : 'Second lesson (Excel v2)'],
    ]);
  add('Questions', QUESTION_HEADERS, [
    question('ARB12_Q01', 'ARB12_EX2021', 'ARB12_CH01', 1, 'mcq', variant === 'first' ? 'Which is the mubtada?' : 'Excel v2 mubtada question', { option_a: 'A1', option_b: 'B1', option_c: 'C1', option_d: 'D1', correct_answer: 'B' }),
    question('ARB12_Q02', 'ARB12_EX2021', 'ARB12_CH01', 2, 'fill', variant === 'first' ? 'The doer of the verb is the ___' : 'The doer of the verb is the ___ (v2)', { correct_answer: 'fa3il', answer_type: 'text', accepted_answers: 'faail' }),
    question('ARB12_Q03', 'ARB12_PRACTICE', 'ARB12_CH02', 1, 'mcq', 'Practice question', { option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_answer: 'A' }),
  ].map(row => row));
  add('Glossary',
    ['row_status', 'glossary_id', 'subject_id', 'term_so', 'term_en', 'term_ar'],
    [['', 'ARB12_G1', 'ARB12', 'Magac', 'Noun', 'اسم']]);
  add('Lists', ['question_type', 'resource_type', 'language', 'direction', 'answer_status', 'status'], LIST_ROWS);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main() {
  const db = await startTestDb('guuldoon-builder');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Course } = await import('../models/course.model');
    const { default: CourseContent } = await import('../models/course-content.model');
    const { default: Chapter } = await import('../models/guuldoon-chapter.model');
    const { default: Resource } = await import('../models/guuldoon-resource.model');
    const { default: Question } = await import('../models/guuldoon-question.model');
    const { default: Exam } = await import('../models/guuldoon-past-exam.model');
    const { default: Attempt } = await import('../models/guuldoon-attempt.model');
    const { default: Config } = await import('../models/guuldoon-course-config.model');
    const { generateAccessToken } = await import('../utils/jwt');
    const mongoose = (await import('mongoose')).default;

    const admin = await User.create({ email: 'gd-builder-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Guuldoon Builder School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test',
      phone: '+252600000222', email: 'gd-builder-school@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const orgAdmin = await User.create({ email: 'gd-builder-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const token = (user: any) => generateAccessToken({
      userId: String(user._id), role: user.role, organizationId: user.organizationId?.toString(), permissions: [],
    });
    const adminHeaders = { Authorization: `Bearer ${token(admin)}` };
    const orgHeaders = { Authorization: `Bearer ${token(orgAdmin)}` };

    const course = await Course.create({
      title: { en: 'Arabic' }, slug: 'guuldoon-arabic-builder', scope: 'global', globalGrade: 12, status: 'published', duration: 8, maxStudents: 50,
    });
    const base = `/api/v1/guuldoon/admin/builder`;
    const importWorkbook = async (variant: 'first' | 'second') => {
      const excel = await workbook(variant);
      const validation = await request(app)
        .post(`/api/v1/guuldoon/admin/import/courses/${course._id}/validate`)
        .set(adminHeaders)
        .attach('excel', excel, { filename: 'Guuldoon_Universal_Import_Template.xlsx' });
      assert.equal(validation.status, 200, JSON.stringify(validation.body));
      assert.deepEqual(validation.body.data.errors, [], JSON.stringify(validation.body.data.errors));
      const committed = await request(app)
        .post(`/api/v1/guuldoon/admin/import/courses/${course._id}/commit`)
        .set(adminHeaders)
        .field('batchId', validation.body.data.batchId)
        .attach('excel', excel, { filename: 'Guuldoon_Universal_Import_Template.xlsx' });
      assert.equal(committed.status, 200, JSON.stringify(committed.body));
      return committed.body.data;
    };

    // Only the Super Admin may use the builder endpoints.
    const denied = await request(app).get(`${base}/courses/${course._id}`).set(orgHeaders);
    assert.equal(denied.status, 403);

    const first = await importWorkbook('first');
    assert.equal(first.created.Questions, 3);
    assert.equal(first.created.Resources, 2);
    assert.equal(first.preserved.Questions, 0);

    // Student attempts feed the per-chapter average (accuracy per student, then mean).
    const user1 = new mongoose.Types.ObjectId();
    const user2 = new mongoose.Types.ObjectId();
    const anyId = new mongoose.Types.ObjectId();
    const attempt = (user: any, chapterId: string, correct: boolean) => ({ user, student: anyId, course: course._id, question: anyId, chapterId, correct, answer: 'x', timeMs: 10 });
    await Attempt.insertMany([
      attempt(user1, 'ARB12_CH01', true), attempt(user1, 'ARB12_CH01', true), attempt(user1, 'ARB12_CH01', true), attempt(user1, 'ARB12_CH01', false), // 75%
      attempt(user2, 'ARB12_CH01', true), attempt(user2, 'ARB12_CH01', false), // 50%
    ]);

    // ── Overview mirrors the student experience ──────────────────────────────
    const overview = await request(app).get(`${base}/courses/${course._id}`).set(adminHeaders);
    assert.equal(overview.status, 200, JSON.stringify(overview.body));
    const data = overview.body.data;
    assert.equal(data.mode, 'imported');
    assert.equal(data.chapters.length, 2);
    const ch1 = data.chapters[0];
    assert.equal(ch1.id, 'ARB12_CH01');
    assert.equal(ch1.examWeight, 60);
    assert.equal(ch1.weightSource, 'chapter');
    assert.equal(ch1.lessonCount, 2);
    assert.equal(ch1.questionCount, 2);
    assert.deepEqual(ch1.years, [{ year: 2021, count: 2 }]);
    assert.equal(ch1.avgMastery, 63, 'mean of 75% and 50% rounded');
    assert.equal(ch1.masteryStudents, 2);
    assert.equal(data.chapters[1].practiceCount, 1);
    assert.equal(data.chapters[1].avgMastery, null);
    assert.equal(data.exams.length, 2);
    assert.equal(data.glossary.source, 'import');
    assert.equal(data.stats.questions, 3);

    // ── Chapter content: lessons, per-year questions and practice ───────────
    const content = await request(app).get(`${base}/courses/${course._id}/chapters/ARB12_CH01`).set(adminHeaders);
    assert.equal(content.status, 200, JSON.stringify(content.body));
    assert.equal(content.body.data.lessons.length, 2);
    assert.equal(content.body.data.questions.length, 2);
    const mcq = content.body.data.questions.find((item: any) => item.type === 'mcq');
    assert.equal(mcq.answer, 1);
    assert.match(mcq.answerDisplay, /B1/);
    assert.equal(mcq.manuallyEdited, false);
    const fill = content.body.data.questions.find((item: any) => item.type === 'fill');
    assert.deepEqual(fill.answer.accepted.sort(), ['fa3il', 'faail']);

    // ── Chapter edit ────────────────────────────────────────────────────────
    const badWeight = await request(app).patch(`${base}/courses/${course._id}/chapters/ARB12_CH01`).set(adminHeaders).send({ examWeight: 140 });
    assert.equal(badWeight.status, 400);
    const chapterEdit = await request(app).patch(`${base}/courses/${course._id}/chapters/ARB12_CH01`).set(adminHeaders)
      .send({ titleEn: 'Nominal sentence (fixed)', titleSo: 'Jumlad magac', examWeight: 55 });
    assert.equal(chapterEdit.status, 200, JSON.stringify(chapterEdit.body));
    const editedChapter = await Chapter.findOne({ course: course._id, externalId: 'ARB12_CH01' }).lean();
    assert.equal(editedChapter?.titleEn, 'Nominal sentence (fixed)');
    assert.equal(editedChapter?.examWeight, 55);
    assert.equal(editedChapter?.manuallyEdited, true);
    const missingChapter = await request(app).patch(`${base}/courses/${course._id}/chapters/NOPE`).set(adminHeaders).send({ examWeight: 10 });
    assert.equal(missingChapter.status, 404);

    // ── Lessons ─────────────────────────────────────────────────────────────
    const lessonId = content.body.data.lessons[0].id;
    const lessonEdit = await request(app).patch(`${base}/lessons/${lessonId}`).set(adminHeaders).send({ title: 'Mubtada (fixed)', contentText: 'Fixed lesson text', pageFrom: 2 });
    assert.equal(lessonEdit.status, 200, JSON.stringify(lessonEdit.body));
    const editedLesson = await Resource.findById(lessonId).lean();
    assert.equal(editedLesson?.contentText, 'Fixed lesson text');
    assert.equal(editedLesson?.manuallyEdited, true);
    const emptyTitle = await request(app).patch(`${base}/lessons/${lessonId}`).set(adminHeaders).send({ title: '  ' });
    assert.equal(emptyTitle.status, 400);
    const newLesson = await request(app).post(`${base}/courses/${course._id}/chapters/ARB12_CH01/lessons`).set(adminHeaders).send({ title: 'Added by hand', contentText: 'Body' });
    assert.equal(newLesson.status, 201, JSON.stringify(newLesson.body));
    const createdLesson = await Resource.findById(newLesson.body.data.id).lean();
    assert.equal(createdLesson?.chapterExternalId, 'ARB12_CH01');
    assert.equal(createdLesson?.language, 'ar', 'defaults to the subject language');
    const removeLesson = await request(app).delete(`${base}/lessons/${newLesson.body.data.id}`).set(adminHeaders);
    assert.equal(removeLesson.status, 200);
    assert.equal(await Resource.countDocuments({ course: course._id, chapterExternalId: 'ARB12_CH01' }), 2);

    // ── Questions ───────────────────────────────────────────────────────────
    const badAnswer = await request(app).patch(`${base}/questions/${mcq.id}`).set(adminHeaders).send({ answer: 9 });
    assert.equal(badAnswer.status, 400);
    const shrink = await request(app).patch(`${base}/questions/${mcq.id}`).set(adminHeaders).send({ options: ['only one'] });
    assert.equal(shrink.status, 400);
    const fixed = await request(app).patch(`${base}/questions/${mcq.id}`).set(adminHeaders)
      .send({ textSo: 'Which word is the mubtada? (fixed)', options: ['A2', 'B2', 'C2', 'D2'], answer: 2, answerStatus: 'verified', chapterId: 'ARB12_CH02' });
    assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
    const fixedDoc = await Question.findById(mcq.id).select('+answer');
    assert.equal(fixedDoc?.answer, 2);
    assert.equal(fixedDoc?.chapterId, 'ARB12_CH02', 'moved to another chapter');
    assert.equal(fixedDoc?.markingMode, 'auto');
    assert.equal(fixedDoc?.manuallyEdited, true);

    const fillEdit = await request(app).patch(`${base}/questions/${fill.id}`).set(adminHeaders)
      .send({ answer: { kind: 'text', accepted: ['fa3il', 'faail', 'al-faail'] } });
    assert.equal(fillEdit.status, 200, JSON.stringify(fillEdit.body));
    const fillDoc = await Question.findById(fill.id).select('+answer');
    assert.equal((fillDoc?.answer as any).accepted.length, 3);

    const practiceExam = await Exam.findOne({ course: course._id, kind: 'practice' }).lean();
    const pastExam = await Exam.findOne({ course: course._id, kind: 'past' }).lean();
    const movedToPractice = await request(app).patch(`${base}/questions/${fill.id}`).set(adminHeaders).send({ examId: String(practiceExam!._id) });
    assert.equal(movedToPractice.status, 200, JSON.stringify(movedToPractice.body));
    assert.equal(movedToPractice.body.data.number, 2, 'takes the next free number in the target exam');
    const wrongExam = await request(app).patch(`${base}/questions/${fill.id}`).set(adminHeaders).send({ examId: String(new mongoose.Types.ObjectId()) });
    assert.equal(wrongExam.status, 404);

    const created = await request(app).post(`${base}/courses/${course._id}/questions`).set(adminHeaders)
      .send({ examId: String(pastExam!._id), chapterId: 'ARB12_CH01', type: 'mcq', textSo: 'Added by hand', options: ['x', 'y'], answer: 0, answerStatus: 'verified' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.number, 2, 'next number after the one remaining question in 2021');
    const noChapter = await request(app).post(`${base}/courses/${course._id}/questions`).set(adminHeaders)
      .send({ examId: String(pastExam!._id), chapterId: 'NOPE', type: 'mcq', textSo: 'x', options: ['x', 'y'], answer: 0 });
    assert.equal(noChapter.status, 400);

    const dropped = await request(app).delete(`${base}/questions/${created.body.data.id}`).set(adminHeaders);
    assert.equal(dropped.status, 200);
    assert.equal(await Question.countDocuments({ _id: created.body.data.id }), 0);

    // ── Settings never wipe weights ─────────────────────────────────────────
    const settings = await request(app).put(`${base}/courses/${course._id}/settings`).set(adminHeaders).send({ passTarget: 80, targetExamDate: '2027-06-12' });
    assert.equal(settings.status, 200, JSON.stringify(settings.body));
    const badTarget = await request(app).put(`${base}/courses/${course._id}/settings`).set(adminHeaders).send({ passTarget: 150 });
    assert.equal(badTarget.status, 400);
    const refreshed = await request(app).get(`${base}/courses/${course._id}`).set(adminHeaders);
    assert.equal(refreshed.body.data.config.passTarget, 80);
    assert.equal(refreshed.body.data.chapters[0].examWeight, 55);

    // ── Re-importing the Excel keeps hand edits and still updates the rest ──
    const second = await importWorkbook('second');
    assert.equal(second.preserved.Chapters, 1, 'edited chapter kept');
    assert.equal(second.preserved.Resources, 1, 'edited lesson kept');
    assert.equal(second.preserved.Questions, 2, 'both edited questions kept');
    assert.equal(second.updated.Resources, 1, 'untouched lesson still follows the Excel');
    assert.ok(second.warnings.some((item: any) => item.field === '_manual_edit'));
    assert.equal((await Chapter.findOne({ externalId: 'ARB12_CH01' }).lean())?.titleEn, 'Nominal sentence (fixed)');
    assert.equal((await Chapter.findOne({ externalId: 'ARB12_CH02' }).lean())?.titleEn, 'Verbal sentence');
    assert.equal((await Resource.findOne({ externalId: 'ARB12_RES1' }).lean())?.contentText, 'Fixed lesson text');
    assert.equal((await Resource.findOne({ externalId: 'ARB12_RES2' }).lean())?.contentText, 'Second lesson (Excel v2)');
    const keptQuestion = await Question.findOne({ externalId: 'ARB12_Q01' }).select('+answer').lean();
    assert.equal(keptQuestion?.textSo, 'Which word is the mubtada? (fixed)');
    assert.equal(keptQuestion?.answer, 2);
    assert.equal(keptQuestion?.chapterId, 'ARB12_CH02');
    assert.equal((await Question.findOne({ externalId: 'ARB12_Q03' }).lean())?.textSo, 'Practice question', 'unedited question unchanged');

    // ── Classic Course Builder courses stay readable, weights editable ──────
    const legacyCourse = await Course.create({
      title: { en: 'Physics' }, slug: 'guuldoon-physics-builder', scope: 'global', globalGrade: 12, status: 'published', duration: 8, maxStudents: 50,
    });
    const legacyContent = await CourseContent.create({
      course: legacyCourse._id,
      chapters: [{ title: 'Electricity', description: '', order: 0, status: 'published', items: [{ title: 'Ohm law', type: 'lesson', order: 0, status: 'published' }] }],
    });
    const legacyChapterId = String(legacyContent.chapters[0]._id);
    const legacyOverview = await request(app).get(`${base}/courses/${legacyCourse._id}`).set(adminHeaders);
    assert.equal(legacyOverview.status, 200, JSON.stringify(legacyOverview.body));
    assert.equal(legacyOverview.body.data.mode, 'legacy');
    assert.equal(legacyOverview.body.data.chapters[0].lessonCount, 1);
    assert.equal(legacyOverview.body.data.chapters[0].editableLessons, false);
    const legacyWeight = await request(app).patch(`${base}/courses/${legacyCourse._id}/chapters/${legacyChapterId}`).set(adminHeaders).send({ examWeight: 100 });
    assert.equal(legacyWeight.status, 200, JSON.stringify(legacyWeight.body));
    assert.equal((await Config.findOne({ course: legacyCourse._id }).lean())?.chapterWeights[0]?.examWeight, 100);
    const legacyLesson = await request(app).post(`${base}/courses/${legacyCourse._id}/chapters/${legacyChapterId}/lessons`).set(adminHeaders).send({ title: 'x' });
    assert.equal(legacyLesson.status, 400);

    console.log('Guuldoon builder: overview, chapter content, chapter/lesson/question edits, access control and import preservation passed.');
  } finally {
    await db.stop();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
