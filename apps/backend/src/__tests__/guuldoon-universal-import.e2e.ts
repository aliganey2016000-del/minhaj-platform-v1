process.env.JWT_ACCESS_SECRET = 'guuldoon-import-access';
process.env.JWT_REFRESH_SECRET = 'guuldoon-import-refresh';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import request from 'supertest';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import { startTestDb } from './support/test-db';

const binaryParser = (res: any, callback: (error: Error | null, body?: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer | Uint8Array | string) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error: Error) => callback(error));
};

const LIST_ROWS = [
  ['mcq','video','so','ltr','verified','draft'],
  ['structured','audio','en','rtl','pending','published'],
  ['fill','pdf','ar','auto','',''],
  ['match','book','','','',''],
  ['','image','','','',''],
  ['','note','','','',''],
  ['','link','','','',''],
];

async function workbookBuffer(options: { duplicate?: boolean; invalidReference?: boolean; missingFigure?: boolean } = {}) {
  const wb = new ExcelJS.Workbook();
  const add = (name: string, headers: string[], rows: any[][]) => {
    const sheet = wb.addWorksheet(name);
    sheet.addRow(headers);
    rows.forEach(row => sheet.addRow(row));
  };

  add('Subjects',
    ['row_status','subject_id','grade','name_so','name_en','name_ar','description_so','description_en','status'],
    [['','PHY12',12,'Fiisigis','Physics','الفيزياء','Diyaarinta','Exam preparation','published']],
  );
  add('Chapters',
    ['row_status','chapter_id','subject_id','order','title_so','title_en','title_ar','exam_weight','status'],
    [
      ['','PHY12_CH01','PHY12',1,'Koronto','Electricity','الكهرباء',60,'published'],
      ['','PHY12_CH02','PHY12',2,'Mowjado','Waves','الموجات',40,'published'],
    ],
  );
  add('Exams',
    ['row_status','exam_id','subject_id','year','duration_min','total_marks','source','answer_key_status','published','notes'],
    [['','PHY12_EX2021','PHY12',2021,120,100,'National exam','verified',true,'Official key']],
  );
  add('Resources',
    ['row_status','resource_id','subject_id','chapter_id','type','title','url','file_name','page_from','page_to','language','direction','offline_available','content_text'],
    [['','PHY12_RES001','PHY12','PHY12_CH01','note','Ohm Law','','',10,12,'so','ltr',true,'$V = IR$']],
  );

  const questions = [
    ['', 'PHY12_2021_Q01','PHY12_EX2021','PHY12_CH01','',1,'mcq','ar','rtl','إذا كانت $R = 5\\Omega$ والتيار $I = 2A$، احسب الجهد.','If $R = 5\\Omega$ and $I = 2A$, find V.',2,'2V','10V','20V','5V','B','verified','ohms-law;resistance','circuit.png','PHY12_RES001','Isticmaal $V = IR$.','',10,12,'','',''],
    ['', 'PHY12_2021_Q02','PHY12_EX2021','PHY12_CH02','PHY12_2021_Q01',2,'structured','so','ltr','Sharax mowjadda.','Explain the wave.',4,'','','','','Draft answer','pending','waves','','','Sharaxaad qabyada ah','','','','','',''],
  ];
  if (options.invalidReference) {
    questions.push(['', 'PHY12_BAD_REF','PHY12_EX2021','PHY12_MISSING','',3,'mcq','so','ltr','Su’aal khaldan','Bad ref',1,'A','B','C','D','A','verified','bad','','','','','','','','','','']);
  }
  if (options.missingFigure) {
    questions.push(['', 'PHY12_BAD_FIG','PHY12_EX2021','PHY12_CH01','',4,'mcq','so','ltr','Sawir maqan','Missing figure',1,'A','B','C','D','A','verified','figure','missing.png','','','','','','','','','']);
  }
  if (options.duplicate) {
    questions.push(['', 'PHY12_2021_Q01','PHY12_EX2021','PHY12_CH01','',5,'mcq','so','ltr','Duplicate','Duplicate',1,'A','B','C','D','A','verified','duplicate','','','','','','','','','','']);
  }
  add('Questions',
    ['row_status','question_id','exam_id','chapter_id','parent_id','number','type','language','direction','text','text_en','marks','option_a','option_b','option_c','option_d','correct_answer','answer_status','topic_tags','figure_files','resource_id','explainer_text','explainer_audio','book_page_from','book_page_to','similar_question_1','similar_question_2','notes'],
    questions,
  );
  add('Glossary',
    ['row_status','glossary_id','subject_id','term_so','term_en','term_ar'],
    [['','PHY12_G001','PHY12','Iska-caabin','Resistance','المقاومة']],
  );
  add('Lists',
    ['question_type','resource_type','language','direction','answer_status','status'],
    LIST_ROWS,
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function figuresZip(malicious = false) {
  const zip = new AdmZip();
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(malicious ? 10 : 32)]);
  if (!malicious) {
    zip.addFile('figures/circuit.png', png);
    return zip.toBuffer();
  }

  const safeName = 'aa/evil.png';
  const unsafePrefix = String.fromCharCode(46, 46, 47);
  const unsafeName = unsafePrefix + 'evil.png';
  zip.addFile(safeName, png);
  const buffer = zip.toBuffer();
  let offset = 0;
  while ((offset = buffer.indexOf(Buffer.from(safeName), offset)) >= 0) {
    Buffer.from(unsafeName).copy(buffer, offset);
    offset += unsafeName.length;
  }
  return buffer;
}

async function main() {
  const db = await startTestDb('guuldoon-universal-import');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Student } = await import('../models/student.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Subscription } = await import('../models/global-subscription.model');
    const { default: Subject } = await import('../models/guuldoon-subject.model');
    const { default: Chapter } = await import('../models/guuldoon-chapter.model');
    const { default: Exam } = await import('../models/guuldoon-past-exam.model');
    const { default: Resource } = await import('../models/guuldoon-resource.model');
    const { default: Question } = await import('../models/guuldoon-question.model');
    const { default: Glossary } = await import('../models/guuldoon-glossary.model');
    const { generateAccessToken } = await import('../utils/jwt');

    const admin = await User.create({ email: 'gd-import-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Guuldoon Import School',
      organizationType: 'private',
      country: 'Somalia',
      city: 'Mogadishu',
      address: 'Test',
      phone: '+252600000111',
      email: 'gd-import-school@test.local',
      principalName: 'Principal',
      establishedYear: 2020,
      createdBy: admin._id,
    });
    const classroom = await ClassModel.create({ school: school._id, title: 'Grade 12', room: '12', gradeLevel: 12 });
    const studentUser = await User.create({
      email: 'gd-import-student@test.local',
      password: 'StudentPassword123!',
      role: 'student',
      organizationId: school._id,
    });
    const profile = await Profile.create({ user: studentUser._id, firstName: 'Aamino', lastName: 'Import', gender: 'female' });
    await Student.create({
      user: studentUser._id,
      profile: profile._id,
      studentId: 'GD-IMPORT-001',
      school: school._id,
      class: classroom._id,
      status: 'active',
      approvalStatus: 'approved',
    });
    const course = await Course.create({
      title: { en: 'Physics' },
      slug: 'guuldoon-physics-universal-import',
      scope: 'global',
      globalGrade: 12,
      status: 'published',
      duration: 8,
      maxStudents: 50,
    });
    await Subscription.create({
      user: studentUser._id,
      school: school._id,
      grade: 12,
      paymentReference: 'GD-IMPORT-PAY-1',
      verifiedReference: 'GD-IMPORT-PAY-1',
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

    // Template is universal and contains exactly the required named sheets.
    const template = await request(app)
      .get('/api/v1/guuldoon/admin/import/template')
      .set(adminHeaders)
      .buffer(true)
      .parse(binaryParser);
    assert.equal(template.status, 200);
    const templateWb = new ExcelJS.Workbook();
    await templateWb.xlsx.load(template.body as any);
    for (const name of ['Subjects','Chapters','Exams','Resources','Questions','Glossary','Lists']) {
      assert.ok(templateWb.getWorksheet(name), `template contains ${name}`);
    }

    // Duplicate question_id is a row-level validation error with row details.
    const duplicate = await request(app)
      .post(`/api/v1/guuldoon/admin/import/courses/${course._id}/validate`)
      .set(adminHeaders)
      .attach('excel', await workbookBuffer({ duplicate: true }), { filename: 'Guuldoon_Universal_Import_Template.xlsx' })
      .attach('figures', figuresZip(), { filename: 'figures.zip' });
    assert.equal(duplicate.status, 200, JSON.stringify(duplicate.body));
    assert.ok(duplicate.body.data.errors.some((item: any) => item.field === 'question_id' && /Duplicate/.test(item.message)));

    // Unsafe ZIP paths are rejected before extraction.
    const unsafeZip = await request(app)
      .post(`/api/v1/guuldoon/admin/import/courses/${course._id}/validate`)
      .set(adminHeaders)
      .attach('excel', await workbookBuffer(), { filename: 'Guuldoon_Universal_Import_Template.xlsx' })
      .attach('figures', figuresZip(true), { filename: 'figures.zip' });
    assert.equal(unsafeZip.status, 400);

    // One missing relationship and one missing figure must not invalidate unrelated rows.
    const excel = await workbookBuffer({ invalidReference: true, missingFigure: true });
    const zip = figuresZip();
    const validation = await request(app)
      .post(`/api/v1/guuldoon/admin/import/courses/${course._id}/validate`)
      .set(adminHeaders)
      .attach('excel', excel, { filename: 'Guuldoon_Universal_Import_Template.xlsx' })
      .attach('figures', zip, { filename: 'figures.zip' });
    assert.equal(validation.status, 200, JSON.stringify(validation.body));
    assert.ok(validation.body.data.errors.some((item: any) => item.id === 'PHY12_BAD_REF' && item.field === 'chapter_id'));
    assert.ok(validation.body.data.errors.some((item: any) => item.id === 'PHY12_BAD_FIG' && item.field === 'figure_files'));
    assert.equal(validation.body.data.summary.Questions.valid, 2);

    const batchId = validation.body.data.batchId;
    const committed = await request(app)
      .post(`/api/v1/guuldoon/admin/import/courses/${course._id}/commit`)
      .set(adminHeaders)
      .field('batchId', batchId)
      .attach('excel', excel, { filename: 'Guuldoon_Universal_Import_Template.xlsx' })
      .attach('figures', zip, { filename: 'figures.zip' });
    assert.equal(committed.status, 200, JSON.stringify(committed.body));
    assert.equal(committed.body.data.created.Subjects, 1);
    assert.equal(committed.body.data.created.Chapters, 2);
    assert.equal(committed.body.data.created.Exams, 1);
    assert.equal(committed.body.data.created.Resources, 1);
    assert.equal(committed.body.data.created.Questions, 2);
    assert.equal(committed.body.data.created.Glossary, 1);
    assert.ok(committed.body.data.skipped >= 2);
    assert.equal(committed.body.data.imagesUploaded, 1);

    assert.equal(await Subject.countDocuments({ course: course._id }), 1);
    assert.equal(await Chapter.countDocuments({ course: course._id }), 2);
    assert.equal(await Exam.countDocuments({ course: course._id }), 1);
    assert.equal(await Resource.countDocuments({ course: course._id }), 1);
    assert.equal(await Question.countDocuments({ course: course._id }), 2);
    assert.equal(await Glossary.countDocuments({ course: course._id }), 1);

    const q1 = await Question.findOne({ course: course._id, externalId: 'PHY12_2021_Q01' }).select('+answer').lean();
    const q2 = await Question.findOne({ course: course._id, externalId: 'PHY12_2021_Q02' }).select('+answer').lean();
    assert.equal(q1?.language, 'ar');
    assert.equal(q1?.direction, 'rtl');
    assert.match(q1?.textSo || '', /\$R = 5\\Omega\$/);
    assert.equal(q1?.answerStatus, 'verified');
    assert.equal(q1?.markingMode, 'auto');
    assert.equal(q1?.answer, 1);
    assert.equal(q2?.answerStatus, 'pending');
    assert.equal(q2?.markingMode, 'manual');
    assert.ok(q1?.figureUrl?.startsWith('/uploads/guuldoon/'));

    // Re-import is idempotent: stable external IDs update instead of duplicating.
    const validation2 = await request(app)
      .post(`/api/v1/guuldoon/admin/import/courses/${course._id}/validate`)
      .set(adminHeaders)
      .attach('excel', excel, { filename: 'Guuldoon_Universal_Import_Template.xlsx' })
      .attach('figures', zip, { filename: 'figures.zip' });
    const committed2 = await request(app)
      .post(`/api/v1/guuldoon/admin/import/courses/${course._id}/commit`)
      .set(adminHeaders)
      .field('batchId', validation2.body.data.batchId)
      .attach('excel', excel, { filename: 'Guuldoon_Universal_Import_Template.xlsx' })
      .attach('figures', zip, { filename: 'figures.zip' });
    assert.equal(committed2.status, 200, JSON.stringify(committed2.body));
    assert.equal(committed2.body.data.created.Questions, 0);
    assert.equal(await Question.countDocuments({ course: course._id }), 2);

    // Student experience uses imported chapters/resources/glossary without touching normal CourseContent.
    const verifiedDevice = await request(app)
      .post('/api/v1/guuldoon/devices/verify-password')
      .set(studentHeaders)
      .send({ password: 'StudentPassword123!' });
    assert.equal(verifiedDevice.status, 200);
    const cookie = (verifiedDevice.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const opened = await request(app)
      .post(`/api/v1/guuldoon/courses/${course._id}/open`)
      .set(studentHeaders)
      .set('Cookie', cookie);
    assert.equal(opened.status, 200);

    const experience = await request(app)
      .get(`/api/v1/guuldoon/courses/${course._id}/experience`)
      .set(studentHeaders)
      .set('Cookie', cookie);
    assert.equal(experience.status, 200, JSON.stringify(experience.body));
    assert.equal(experience.body.data.chapters[0].id, 'PHY12_CH01');
    assert.equal(experience.body.data.chapters[0].items[0].title, 'Ohm Law');
    assert.equal(experience.body.data.glossary[0].termAr, 'المقاومة');

    const exam = await request(app)
      .get(`/api/v1/guuldoon/courses/${course._id}/exams/${q1!.exam}`)
      .set(studentHeaders)
      .set('Cookie', cookie);
    assert.equal(exam.status, 200);
    const publicQ1 = exam.body.data.questions.find((item: any) => item.externalId === 'PHY12_2021_Q01');
    const publicQ2 = exam.body.data.questions.find((item: any) => item.externalId === 'PHY12_2021_Q02');
    assert.equal(publicQ1.answer, undefined);

    const autoMarked = await request(app)
      .post(`/api/v1/guuldoon/questions/${publicQ1._id}/answer`)
      .set(studentHeaders)
      .set('Cookie', cookie)
      .send({ answer: 1 });
    assert.equal(autoMarked.status, 200);
    assert.equal(autoMarked.body.data.marked, true);
    assert.equal(autoMarked.body.data.correct, true);

    const pending = await request(app)
      .post(`/api/v1/guuldoon/questions/${publicQ2._id}/answer`)
      .set(studentHeaders)
      .set('Cookie', cookie)
      .send({ answer: 'draft' });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.data.marked, false);
    assert.equal(pending.body.data.correct, null);

    // Error report is downloadable and auditable.
    const report = await request(app)
      .get(`/api/v1/guuldoon/admin/import/batches/${batchId}/errors`)
      .set(adminHeaders);
    assert.equal(report.status, 200);
    assert.match(String(report.headers['content-type']), /spreadsheetml/);

    console.log('Guuldoon universal Excel importer: template, validation, ZIP safety, partial import, idempotency, RTL/LaTeX and auto-marking passed.');
  } finally {
    await db.stop();
  }
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
