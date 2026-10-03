/**
 * Phase 3 upload regressions from the 2026-10-03 deep audit.
 *
 * M2  Teachers could upload any file type (HTML, SVG, scripts) into the
 *     public /uploads folder on the API's own origin, and stored attachment
 *     URLs were joined to the disk path unchecked (`/uploads/../...`).
 * M3  Student/teacher documents and voice notes were reachable as public
 *     static files; teacher documents had no checked endpoint at all.
 * P3  /uploads was served with no caching or protective headers.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
delete process.env.CLOUDINARY_URL;
delete process.env.CLOUDINARY_CLOUD_NAME;

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('phase3-uploads');
  const created: string[] = [];
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Parent } = await import('../models/parent.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Assignment } = await import('../models/assignment.model');

    const token = (user: any) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions: [],
      organizationId: user.organizationId ? user.organizationId.toString() : undefined,
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const admin = await User.create({ email: 'p3-admin@test.local', password: 'Password123!', role: 'admin' });
    const makeSchool = (name: string) => School.create({
      name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St', phone: '+000',
      email: `${name.replace(/\s/g, '')}@test.local`, principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const schoolA = await makeSchool('Phase3 A');
    const schoolB = await makeSchool('Phase3 B');
    const orgAdminA = await User.create({ email: 'p3-org-a@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    const orgAdminB = await User.create({ email: 'p3-org-b@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });
    const teacherUser = await User.create({ email: 'p3-teacher@test.local', password: 'Password123!', role: 'teacher', organizationId: schoolA._id });
    const profile = await Profile.create({ user: teacherUser._id, firstName: 'T', lastName: 'T', gender: 'male' });
    const teacher = await Teacher.create({ user: teacherUser._id, profile: profile._id, school: schoolA._id });
    const course = await Course.create({
      title: { en: 'P3 Course' }, slug: 'p3-course', category: 'general', level: 'beginner', duration: 8, maxStudents: 50,
      school: schoolA._id, teacher: teacher._id, status: 'published',
    });

    section('M2: only document and media types can be uploaded');
    let res = await request(app).post('/api/v1/assignments/upload').set(auth(token(teacherUser)))
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.html', contentType: 'text/html' });
    assert(res.status === 400, `an HTML attachment is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/assignments/upload').set(auth(token(teacherUser)))
      .attach('file', Buffer.from('<svg onload="alert(1)"/>'), { filename: 'evil.svg', contentType: 'image/svg+xml' });
    assert(res.status === 400, `an SVG attachment is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/assignments/upload').set(auth(token(teacherUser)))
      .attach('file', Buffer.from('<html></html>'), { filename: 'notes.html', contentType: 'application/pdf' });
    assert(res.status === 400, `a PDF type with an .html name is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/assignments/upload').set(auth(token(teacherUser)))
      .attach('file', Buffer.from('plain notes'), { filename: 'notes.txt', contentType: 'text/plain' });
    const uploadedUrl: string = res.body?.data?.url || '';
    assert(res.status === 200 && uploadedUrl.startsWith(`/uploads/assignments/${schoolA._id}/`), `a text attachment is stored under the school's folder (got ${uploadedUrl})`);
    if (uploadedUrl) created.push(path.join(process.cwd(), uploadedUrl.replace(/^\//, '')));

    section('P3: public uploads carry protective, cacheable headers');
    res = await request(app).get(uploadedUrl);
    assert(res.status === 200, `the stored file is served (got ${res.status})`);
    assert(res.headers['x-content-type-options'] === 'nosniff', 'served with nosniff');
    assert(String(res.headers['content-security-policy'] || '').includes('sandbox'), 'served with a sandboxing CSP');
    assert(String(res.headers['content-disposition'] || '').startsWith('attachment'), 'a non-media file is sent as a download');
    assert(/max-age=86400/.test(String(res.headers['cache-control'] || '')), `cached for a day (got ${res.headers['cache-control']})`);

    section('M2: stored attachment URLs cannot leave the uploads folder');
    const assignment = await Assignment.create({
      title: 'P3 assignment', course: course._id, dueDate: new Date(Date.now() + 86400000), createdBy: teacherUser._id,
      attachments: [
        { url: '/uploads/../package.json', name: 'package.json', allowDownload: true },
        { url: uploadedUrl, name: 'notes.txt', allowDownload: false },
      ],
    });
    res = await request(app).get(`/api/v1/assignments/materials/0/view?assignmentId=${assignment._id}`).set(auth(token(teacherUser)));
    assert(res.status === 404 && !String(res.text).includes('"dependencies"'), `a traversal URL is not read from disk (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/materials/1/view?assignmentId=${assignment._id}`).set(auth(token(teacherUser)));
    assert(res.status === 200 && res.text === 'plain notes', `a real attachment still streams (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/materials/1/view?assignmentId=${assignment._id}`).set(auth(token(orgAdminB)));
    assert(res.status === 403, `another school cannot stream it (got ${res.status})`);
    const parentUser = await User.create({ email: 'p3-parent@test.local', password: 'Password123!', role: 'parent', organizationId: schoolA._id });
    const parentProfile = await Profile.create({ user: parentUser._id, firstName: 'P', lastName: 'P', gender: 'male' });
    await Parent.create({ user: parentUser._id, profile: parentProfile._id, parentId: 'PRN-P3', school: schoolA._id, children: [] });
    res = await request(app).get(`/api/v1/assignments/materials/1/view?assignmentId=${assignment._id}`).set(auth(token(parentUser)));
    assert(res.status === 403, `a parent without a child in the course cannot stream it (got ${res.status})`);

    section('M3: teacher documents are private');
    res = await request(app).post(`/api/v1/teachers/${teacher._id}/documents`).set(auth(token(orgAdminA)))
      .attach('file', Buffer.from('<html></html>'), { filename: 'cv.html', contentType: 'text/html' });
    assert(res.status === 400, `an HTML teacher document is refused (got ${res.status})`);
    res = await request(app).post(`/api/v1/teachers/${teacher._id}/documents`).set(auth(token(orgAdminA)))
      .attach('file', Buffer.from('%PDF-1.4 cv'), { filename: 'cv.pdf', contentType: 'application/pdf' });
    const doc = res.body?.data;
    assert(res.status === 201 && Boolean(doc?._id), `a PDF teacher document is stored (got ${res.status})`);
    if (doc?.fileUrl) created.push(path.join(process.cwd(), doc.fileUrl.replace(/^\//, '')));
    res = await request(app).get(doc.fileUrl);
    assert(res.status === 404, `it is not reachable as a public file (got ${res.status})`);
    const sneaky = doc.fileUrl.replace('/uploads/teacher-documents/', '/uploads/assignments/../teacher-documents/');
    res = await request(app).get(sneaky);
    assert(res.status === 404, `nor through a ../ path (got ${res.status})`);
    res = await request(app).get(`/api/v1/teachers/${teacher._id}/documents/${doc._id}/view`).set(auth(token(orgAdminA)));
    assert(res.status === 200 && res.text?.startsWith('%PDF') !== false, `its own school opens it through the checked endpoint (got ${res.status})`);
    res = await request(app).get(`/api/v1/teachers/${teacher._id}/documents/${doc._id}/view`).set(auth(token(orgAdminB)));
    assert(res.status === 403, `another school cannot open it (got ${res.status})`);
    res = await request(app).get('/api/v1/teachers/x/documents/y/view');
    assert(res.status === 401, `it needs a signed-in user (got ${res.status})`);
    res = await request(app).get('/uploads/student-documents/anything.pdf');
    assert(res.status === 404, 'student documents are not public files');
    res = await request(app).get('/uploads/voice-notes/anything.webm');
    assert(res.status === 404, 'voice notes are not public files');
  } finally {
    for (const file of created) fs.rmSync(file, { force: true });
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll phase 3 upload checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
