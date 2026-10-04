/**
 * Phase 2 tenant-isolation regressions from the 2026-10-03 deep audit.
 *
 * C2  Staff were not tenant-scoped: any code path checking
 *     `role === 'org_admin' ? own school : everything` gave staff (and other
 *     unhandled roles, e.g. in global search) every school's data.
 * H2  Announcements/news/events/gallery had no school: every org admin saw
 *     and could edit or delete every other school's items.
 * H3  Resources were global the same way.
 * H4  Any account could sign in on any school's website.
 * H5  A self-registered student still waiting for approval was treated as a
 *     member of the school (token, forum, member list).
 * M4  A school's website listed every school's published courses.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
process.env.BASE_DOMAIN = 'sahaledu.com';

import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('phase2-tenant');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Announcement } = await import('../models/announcement.model');
    const { default: News } = await import('../models/news.model');
    const { default: Resource } = await import('../models/resource.model');
    const { backfillContentSchools } = await import('../utils/content-school-backfill');

    const token = (user: any, permissions: string[] = [], organizationId?: string) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions,
      organizationId: organizationId ?? (user.organizationId ? user.organizationId.toString() : undefined),
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const onHost = (host: string) => ({ 'X-Tenant-Host': host });

    const admin = await User.create({ email: 'p2-admin@example.com', password: 'Password123!', role: 'admin' });
    const makeSchool = (name: string, subdomain: string) => School.create({
      name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St', phone: '+000',
      email: `${subdomain}@example.com`, principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
      subdomain, status: 'active',
    });
    const schoolA = await makeSchool('Phase2 School A', 'p2-alpha');
    const schoolB = await makeSchool('Phase2 School B', 'p2-beta');
    const hostA = 'p2-alpha.sahaledu.com';
    const hostB = 'p2-beta.sahaledu.com';

    const orgAdminA = await User.create({ email: 'p2-orgadmin-a@example.com', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    const orgAdminB = await User.create({ email: 'p2-orgadmin-b@example.com', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });
    const staffA = await User.create({
      email: 'p2-staff-a@example.com', password: 'Password123!', role: 'staff', organizationId: schoolA._id,
      permissions: [{ module: 'organization', actions: ['read'] }],
    });
    const financeA = await User.create({ email: 'p2-finance-a@example.com', password: 'Password123!', role: 'finance_manager', organizationId: schoolA._id });
    const teacherUserA = await User.create({ email: 'p2-teacher-a@example.com', password: 'Password123!', role: 'teacher' });
    const profileT = await Profile.create({ user: teacherUserA._id, firstName: 'T', lastName: 'A', gender: 'male' });
    const teacherA = await Teacher.create({ user: teacherUserA._id, profile: profileT._id, school: schoolA._id });

    const makeCourse = (school: any, slug: string) => Course.create({
      title: { en: `Algebra ${slug}` }, slug, category: 'general', level: 'beginner', duration: 8, maxStudents: 50,
      school: school._id, teacher: teacherA._id, status: 'published',
    });
    const courseA = await makeCourse(schoolA, 'p2-algebra-a');
    const courseB = await makeCourse(schoolB, 'p2-algebra-b');

    const orgAToken = token(orgAdminA);
    const orgBToken = token(orgAdminB);

    section('C2: staff and other school roles stay inside their school');
    let res = await request(app).get('/api/v1/search?q=Algebra').set(auth(token(staffA, ['organization.read'])));
    let slugs = (res.body?.data?.courses || []).map((c: any) => c.slug);
    assert(res.status === 200 && slugs.length === 1 && slugs[0] === 'p2-algebra-a', `staff search sees only their school (got ${slugs.join(',')})`);
    res = await request(app).get('/api/v1/search?q=Algebra').set(auth(token(financeA)));
    slugs = (res.body?.data?.courses || []).map((c: any) => c.slug);
    assert(res.status === 200 && slugs.length === 1 && slugs[0] === 'p2-algebra-a', `finance search sees only their school (got ${slugs.join(',')})`);
    const cashierNoSchool = await User.create({ email: 'p2-cashier@example.com', password: 'Password123!', role: 'cashier' });
    res = await request(app).get('/api/v1/search?q=Algebra').set(auth(token(cashierNoSchool)));
    assert(res.status === 200 && (res.body?.data?.courses || []).length === 0, 'a school role without a school sees nothing');
    res = await request(app).get('/api/v1/search?q=Algebra').set(auth(token(admin)));
    assert((res.body?.data?.courses || []).length === 2, 'the platform admin still searches everything');
    res = await request(app).get(`/api/v1/schools/${schoolB._id}`).set(auth(token(staffA, ['organization.read'])));
    assert(res.status === 403 || res.status === 404, `staff cannot open another school (got ${res.status})`);

    section('H2: announcements and news belong to one school');
    res = await request(app).post('/api/v1/announcements').set(auth(orgAToken)).send({ title: 'A only', content: 'Hello A', school: schoolB._id.toString() });
    assert(res.status === 201 && String(res.body?.data?.school) === schoolA._id.toString(), `an org admin's item is always their own school's (got ${res.body?.data?.school})`);
    const annA = res.body?.data?._id;
    res = await request(app).post('/api/v1/announcements').set(auth(orgBToken)).send({ title: 'B only', content: 'Hello B' });
    const annB = res.body?.data?._id;
    res = await request(app).get('/api/v1/announcements').set(auth(orgAToken));
    let titles = (res.body?.data || []).map((a: any) => a.title);
    assert(res.status === 200 && titles.length === 1 && titles[0] === 'A only', `org admin A lists only school A items (got ${titles.join(',')})`);
    res = await request(app).get('/api/v1/announcements?search=Hello').set(auth(orgAToken));
    titles = (res.body?.data || []).map((a: any) => a.title);
    assert(res.status === 200 && titles.length === 1, `search is scoped too (got ${titles.join(',')})`);
    res = await request(app).get(`/api/v1/announcements?school=${schoolB._id}`).set(auth(orgAToken));
    titles = (res.body?.data || []).map((a: any) => a.title);
    assert(titles.length === 1 && titles[0] === 'A only', 'a ?school= filter cannot reach another school');
    res = await request(app).get('/api/v1/announcements').set(auth(token(teacherUserA, [], schoolA._id.toString())));
    titles = (res.body?.data || []).map((a: any) => a.title);
    assert(res.status === 200 && titles.length === 1 && titles[0] === 'A only', `a teacher sees their own school's items (got ${titles.join(',')})`);
    res = await request(app).patch(`/api/v1/announcements/${annB}`).set(auth(orgAToken)).send({ title: 'Hijacked' });
    assert(res.status === 404, `cannot edit another school's item (got ${res.status})`);
    res = await request(app).patch(`/api/v1/announcements/${annB}/status`).set(auth(orgAToken)).send({ status: 'inactive' });
    assert(res.status === 404, `cannot change another school's item status (got ${res.status})`);
    res = await request(app).patch(`/api/v1/announcements/${annB}/toggle-pin`).set(auth(orgAToken));
    assert(res.status === 404, `cannot pin another school's item (got ${res.status})`);
    res = await request(app).delete(`/api/v1/announcements/${annB}`).set(auth(orgAToken));
    assert(res.status === 404 && Boolean(await Announcement.exists({ _id: annB })), `cannot delete another school's item (got ${res.status})`);
    res = await request(app).patch(`/api/v1/announcements/${annA}`).set(auth(orgAToken)).send({ title: 'A edited', school: schoolB._id.toString() });
    assert(res.status === 200 && String(res.body?.data?.school) === schoolA._id.toString(), 'an edit cannot move an item to another school');
    res = await request(app).get('/api/v1/announcements').set(auth(token(admin)));
    assert((res.body?.data || []).length === 2, 'the platform admin sees every school');

    section('H2: existing content is assigned to its creator\'s school');
    await News.collection.insertMany([
      { title: 'Legacy A', content: 'x', status: 'published', createdBy: orgAdminA._id, createdAt: new Date(), updatedAt: new Date() },
      { title: 'Legacy teacher', content: 'x', status: 'published', createdBy: teacherUserA._id, createdAt: new Date(), updatedAt: new Date() },
      { title: 'Legacy platform', content: 'x', status: 'published', createdBy: admin._id, createdAt: new Date(), updatedAt: new Date() },
      { title: 'Legacy orphan', content: 'x', status: 'published', createdBy: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date() },
    ]);
    const summary = await backfillContentSchools();
    assert(summary.News.assigned === 2 && summary.News.platformOnly === 2, `backfill assigns 2 and keeps 2 platform-only (got ${JSON.stringify(summary.News)})`);
    const byTitle = async (title: string) => (await News.collection.findOne({ title }))?.school;
    assert(String(await byTitle('Legacy A')) === schoolA._id.toString(), "an org admin's item goes to their school");
    assert(String(await byTitle('Legacy teacher')) === schoolA._id.toString(), "a teacher's item goes to the teacher's school");
    assert((await byTitle('Legacy platform')) === null && (await byTitle('Legacy orphan')) === null, 'platform and orphaned items stay platform-only');
    const again = await backfillContentSchools();
    assert(again.News.assigned === 0 && again.News.platformOnly === 0, 'a second run changes nothing');
    res = await request(app).get('/api/v1/news').set(auth(orgBToken));
    assert((res.body?.data || []).length === 0, 'school B sees none of the legacy items');

    section('H3: resources follow their course\'s school');
    const resA = await Resource.create({ title: 'Notes A', course: courseA._id, fileUrl: '/x.pdf', uploadedBy: orgAdminA._id });
    const resB = await Resource.create({ title: 'Notes B', course: courseB._id, fileUrl: '/y.pdf', uploadedBy: orgAdminB._id });
    res = await request(app).get('/api/v1/resources').set(auth(orgAToken));
    titles = (res.body?.data || []).map((r: any) => r.title);
    assert(res.status === 200 && titles.length === 1 && titles[0] === 'Notes A', `org admin lists only their school's resources (got ${titles.join(',')})`);
    res = await request(app).delete(`/api/v1/resources/${resB._id}`).set(auth(orgAToken));
    assert(res.status === 404 && Boolean(await Resource.exists({ _id: resB._id })), `cannot delete another school's resource (got ${res.status})`);
    res = await request(app).post('/api/v1/resources').set(auth(orgAToken)).send({ title: 'Sneaky', course: courseB._id.toString(), fileUrl: '/z.pdf' });
    assert(res.status === 403, `cannot attach a resource to another school's course (got ${res.status})`);
    res = await request(app).delete(`/api/v1/resources/${resA._id}`).set(auth(orgAToken));
    assert(res.status === 204 || res.status === 200, `can still delete their own resource (got ${res.status})`);

    section('H4: sign-in is limited to the school\'s own accounts on its website');
    const login = (email: string, host?: string) => {
      const r = request(app).post('/api/v1/auth/login');
      if (host) r.set(onHost(host));
      return r.send({ email, password: 'Password123!' });
    };
    res = await login('p2-orgadmin-a@example.com', hostB);
    assert(res.status === 403, `a school A account is refused on school B's website (got ${res.status})`);
    res = await login('p2-orgadmin-a@example.com', hostA);
    assert(res.status === 200, `it signs in on its own school's website (got ${res.status})`);
    res = await login('p2-teacher-a@example.com', hostA);
    const teacherClaims: any = jwt.decode(res.body?.data?.accessToken || '');
    assert(res.status === 200 && teacherClaims?.organizationId === schoolA._id.toString(), 'a teacher bound only through their teacher record signs in and carries their school');
    res = await login('p2-orgadmin-a@example.com', 'sahaledu.com');
    assert(res.status === 200, `every account still signs in on the platform domain (got ${res.status})`);
    res = await login('p2-orgadmin-b@example.com');
    assert(res.status === 200, `no tenant host behaves like the platform domain (got ${res.status})`);
    res = await login('p2-admin@example.com', hostB);
    assert(res.status === 200, `the platform admin can sign in anywhere (got ${res.status})`);

    section('H5: a student waiting for approval is not a school member yet');
    res = await request(app).post('/api/v1/auth/register').set(onHost(hostA)).send({
      email: 'p2-pending@example.com', password: 'Password123!', firstName: 'Pending', lastName: 'Student', gender: 'female',
    });
    assert(res.status === 201, `registering on a school website succeeds (got ${res.status})`);
    const pendingStudent = await Student.findOne({ user: (await User.findOne({ email: 'p2-pending@example.com' }))!._id }).lean();
    assert(String(pendingStudent?.school) === schoolA._id.toString() && pendingStudent?.approvalStatus === 'pending', 'it joins that school and waits for approval');
    const pendingClaims: any = jwt.decode(res.body?.data?.accessToken || '');
    assert(!pendingClaims?.organizationId, `the pending student's token carries no school (got ${pendingClaims?.organizationId})`);
    res = await login('p2-pending@example.com', hostA);
    assert(res.status === 200 && !(jwt.decode(res.body?.data?.accessToken) as any)?.organizationId, 'a pending student can sign in on that website, still without a school');
    const pendingUser = await User.findOne({ email: 'p2-pending@example.com' });
    res = await request(app).get('/api/v1/forum/members').set(auth(token(pendingUser)));
    assert(res.status === 400, `a pending student cannot list the school's members (got ${res.status})`);
    res = await request(app).get('/api/v1/forum/members').set(auth(orgAToken));
    const memberEmails = (res.body?.data || []).map((u: any) => u.email);
    assert(res.status === 200 && !memberEmails.includes('p2-pending@example.com'), 'a pending student is not offered as a school member');
    await Student.updateOne({ _id: pendingStudent!._id }, { $set: { approvalStatus: 'approved' } });
    res = await login('p2-pending@example.com', hostA);
    assert((jwt.decode(res.body?.data?.accessToken) as any)?.organizationId === schoolA._id.toString(), 'once approved the token carries the school');

    section('M4: a school website lists only its own courses');
    res = await request(app).get('/api/v1/courses').set(onHost(hostA));
    slugs = (res.body?.data || []).map((c: any) => c.slug);
    assert(res.status === 200 && slugs.length === 1 && slugs[0] === 'p2-algebra-a', `school A's website lists only its courses (got ${slugs.join(',')})`);
    res = await request(app).get('/api/v1/courses/p2-algebra-b').set(onHost(hostA));
    assert(res.status === 404, `another school's course page is not served on it (got ${res.status})`);
    res = await request(app).get('/api/v1/courses/p2-algebra-a').set(onHost(hostA));
    assert(res.status === 200, `its own course page is (got ${res.status})`);
    res = await request(app).get('/api/v1/courses').set(onHost('www.sahaledu.com'));
    assert((res.body?.data || []).length === 2, 'the platform domain keeps the full catalog');
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll phase 2 tenant isolation checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
