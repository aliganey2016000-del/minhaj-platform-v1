/**
 * The AI routes (/api/v1/ai/*) all call out to the DeepSeek paid LLM API —
 * tutor/chat is reachable by any authenticated student with no role check,
 * and the generation endpoints are hit by every teacher/admin. None of them
 * had a per-route rate limiter: only the generic global `/api/` limiter
 * (1000 req/min, tuned for ordinary CRUD traffic) applied, so a scripted
 * client could run up an unbounded per-call API bill. This regression
 * checks the dedicated per-account `aiLimiter` added to
 * routes/v1/ai.routes.ts actually trips well before that global ceiling.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
delete process.env.DEEPSEEK_API_KEY; // not configured — controller fails fast, before any network call

import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('ai-rate-limit');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Profile } = await import('../models/profile.model');

    const token = (user: any) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions: [],
      organizationId: user.organizationId ? user.organizationId.toString() : undefined,
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const admin = await User.create({ email: 'ai-rl-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'AI RL School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St', phone: '+000',
      email: 'ai-rl@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const studentUser = await User.create({ email: 'ai-rl-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
    const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'Ayaan', lastName: 'Student', gender: 'female' });
    await Student.create({ user: studentUser._id, profile: studentProfile._id, school: school._id, studentId: 'AIRL-0001', enrolledCourses: [] });
    const studentToken = token(studentUser);

    section('tutor/chat: a per-account AI limiter trips before the global ceiling');
    const statuses: number[] = [];
    // 21 rapid calls — the 21st must be rejected by the dedicated AI limiter
    // (max 20/min) long before the global 1000/min budget is anywhere close.
    for (let i = 0; i < 21; i += 1) {
      const res = await request(app)
        .post('/api/v1/ai/tutor/chat')
        .set(auth(studentToken))
        .send({ courseId: '000000000000000000000000', message: 'hello' });
      statuses.push(res.status);
    }
    const limited = statuses.filter((s) => s === 429).length;
    assert(statuses.slice(0, 20).every((s) => s !== 429), `first 20 requests are not rate-limited (got ${statuses.slice(0, 20).join(',')})`);
    assert(statuses[20] === 429, `the 21st request within the window is rejected with 429 (got ${statuses[20]})`);
    assert(limited >= 1, 'the AI-specific limiter actually engaged');

    section('tutor/chat: the limiter is keyed per account, not shared globally');
    const otherStudentUser = await User.create({ email: 'ai-rl-student-2@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
    const otherProfile = await Profile.create({ user: otherStudentUser._id, firstName: 'Hodan', lastName: 'Student', gender: 'female' });
    await Student.create({ user: otherStudentUser._id, profile: otherProfile._id, school: school._id, studentId: 'AIRL-0002', enrolledCourses: [] });
    const otherToken = token(otherStudentUser);
    const otherRes = await request(app)
      .post('/api/v1/ai/tutor/chat')
      .set(auth(otherToken))
      .send({ courseId: '000000000000000000000000', message: 'hello' });
    assert(otherRes.status !== 429, `a different account keeps its own AI budget (got ${otherRes.status})`);
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll AI rate-limit checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
