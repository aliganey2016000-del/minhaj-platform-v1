/**
 * Two regressions from the 2026-10-03 health check:
 *
 * 1. GET /forum/threads/:id sorted messages oldest-first BEFORE skip/limit,
 *    so page 1 was the thread's OLDEST 50 (or 200) messages: any thread
 *    longer than one page never showed its newest messages. Page 1 must now
 *    be the newest `limit` messages, still returned oldest-first for display,
 *    and `since` must return only messages from that timestamp onward.
 *
 * 2. GET /courses (public, unauthenticated) took ?limit= and ?page= unbounded:
 *    a huge limit dumped every published course with three populates, and a
 *    zero/negative value reached Mongo as an invalid skip and 500'd.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}

function fakeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Course } = await import('../models/course.model');
    const { ForumThread, ForumMessage } = await import('../models/forum.model');
    const forumController = await import('../controllers/forum.controller');

    const admin = await User.create({ email: 'forum-order-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Forum Order School', institutionType: 'school', email: 'forum-order@test.local', phone: '+252610000301',
      organizationType: 'school', ownershipType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: 'QA Road', principalName: 'QA Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const orgAdmin = await User.create({ email: 'forum-order-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });

    console.log('\n=== forum: page 1 is the newest messages ===');
    const thread = await ForumThread.create({ organizationId: school._id, type: 'public', title: 'Long thread', createdBy: orgAdmin._id });
    const base = Date.parse('2026-09-01T08:00:00Z');
    // Raw insert so each message keeps its explicit, strictly increasing createdAt.
    await ForumMessage.collection.insertMany(
      Array.from({ length: 260 }, (_, i) => ({
        threadId: thread._id, senderId: orgAdmin._id, content: `msg-${i}`,
        createdAt: new Date(base + i * 1000), updatedAt: new Date(base + i * 1000),
      }))
    );

    const getThread = async (query: Record<string, string>) => {
      const res = fakeRes();
      await forumController.getThread(
        { params: { threadId: thread._id.toString() }, query, user: { userId: orgAdmin._id.toString(), role: 'org_admin', organizationId: school._id.toString() } } as any,
        res
      );
      return res;
    };
    const contents = (res: any) => (res.body?.data?.messages || []).map((m: any) => m.content);

    const byDefault = contents(await getThread({}));
    assert(byDefault.length === 50, `default page has 50 messages (got ${byDefault.length})`);
    assert(byDefault[0] === 'msg-210' && byDefault[49] === 'msg-259', `default page is msg-210..msg-259 oldest-first (got ${byDefault[0]}..${byDefault[49]})`);

    const big = await getThread({ limit: '200' });
    const bigContents = contents(big);
    assert(bigContents[0] === 'msg-60' && bigContents[199] === 'msg-259', `limit=200 is msg-60..msg-259 (got ${bigContents[0]}..${bigContents[199]})`);
    assert(big.body?.meta?.total === 260, 'total still counts the whole thread');

    const page2 = contents(await getThread({ limit: '50', page: '2' }));
    assert(page2[0] === 'msg-160' && page2[49] === 'msg-209', `page 2 is the 50 before page 1 (got ${page2[0]}..${page2[49]})`);

    const since = new Date(base + 255 * 1000).toISOString();
    const sinceContents = contents(await getThread({ since, limit: '200' }));
    assert(
      JSON.stringify(sinceContents) === JSON.stringify(['msg-255', 'msg-256', 'msg-257', 'msg-258', 'msg-259']),
      `since returns msg-255 onward, oldest-first (got ${JSON.stringify(sinceContents)})`
    );

    const badSince = contents(await getThread({ since: 'not-a-date' }));
    assert(badSince.length === 50 && badSince[49] === 'msg-259', 'an invalid since falls back to the newest page');

    console.log('\n=== public GET /courses: page and limit are bounded ===');
    await Course.insertMany(Array.from({ length: 205 }, (_, i) => ({
      title: { en: `Course ${i}`, so: '', ar: '' }, courseCode: `LIM-${i}`, slug: `lim-course-${i}`, description: { en: '', so: '', ar: '' },
      category: '', level: 'beginner', duration: 1, fee: 0, teacher: null, school: school._id,
      maxStudents: 50, enrolledStudents: 0, syllabus: [], prerequisites: [], status: 'published', isLive: false, accessMode: 'open',
    })));

    const huge = await request(app).get('/api/v1/courses?limit=100000');
    assert(huge.status === 200, `huge limit responds 200 (got ${huge.status})`);
    assert((huge.body?.data || []).length === 200 && huge.body?.meta?.limit === 200, `huge limit is capped at 200 (got ${(huge.body?.data || []).length})`);

    const negative = await request(app).get('/api/v1/courses?limit=-5&page=0');
    assert(negative.status === 200, `negative limit and page 0 respond 200 instead of 500 (got ${negative.status})`);
    assert(negative.body?.meta?.page === 1 && negative.body?.meta?.limit === 1, 'they are clamped to page 1, limit 1');

    const normal = await request(app).get('/api/v1/courses');
    assert(normal.status === 200 && normal.body?.meta?.limit === 20, 'default limit is still 20');
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll forum ordering and course limit checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
