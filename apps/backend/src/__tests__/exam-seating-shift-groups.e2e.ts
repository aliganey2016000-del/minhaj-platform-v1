/**
 * Room Plan — departments in different exam shifts share rooms and seats.
 *
 * With Department Shift Assignment (Primary: Shift 1-2, Secondary: Shift 3-4),
 * Primary and Secondary never sit at the same time, so a room's seats are
 * reused by both. Capacity is therefore checked per exam shift, not against
 * every student assigned to the room. Departments whose shifts overlap are
 * counted together, and without any assignment the old one-seat-per-student
 * rule still applies.
 *
 * Repeatable: `npm run test:exam-seating-shift-groups`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import mongoose from 'mongoose';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

const SHIFTS = [
  { name: 'Shift 1', startTime: '08:00', endTime: '08:50' },
  { name: 'Shift 2', startTime: '09:00', endTime: '09:50' },
  { name: 'Shift 3', startTime: '10:00', endTime: '10:50' },
  { name: 'Shift 4', startTime: '11:00', endTime: '11:50' },
];

async function main() {
  const db = await startTestDb('exam-seating-shift-groups');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Student } = await import('../models/student.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: ExamRoom } = await import('../models/exam-room.model');
    const { default: ExamSeatingPlan } = await import('../models/exam-seating-plan.model');

    const admin = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
    const primaryDept = new mongoose.Types.ObjectId();
    const secondaryDept = new mongoose.Types.ObjectId();
    const rulesFor = (secondaryShifts: number[] | null) => ({
      examShiftCount: 4,
      examShifts: SHIFTS,
      departmentShiftAssignments: secondaryShifts
        ? [
            { departmentId: String(primaryDept), shiftIndexes: [0, 1] },
            { departmentId: String(secondaryDept), shiftIndexes: secondaryShifts },
          ]
        : [],
    });
    const school = await School.create({
      name: 'Balcad Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: 'b@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
      examSchedulingRules: rulesFor([2, 3]),
    });
    const orgAdmin = await User.create({ email: 'org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const auth = { Authorization: `Bearer ${generateAccessToken({ userId: orgAdmin._id.toString(), role: 'org_admin', permissions: [], organizationId: school._id.toString() })}` };

    // Two rooms of 22 seats (20 operational after the default 2 reserve seats).
    const roomA = await ExamRoom.create({ name: 'Room A', capacity: 22, school: school._id, createdBy: admin._id });
    const roomB = await ExamRoom.create({ name: 'Room B', capacity: 22, school: school._id, createdBy: admin._id });

    let seq = 0;
    const mkClass = async (title: string, department: mongoose.Types.ObjectId, count: number) => {
      const cls = await ClassModel.create({ school: school._id, title, section: 'A', room: 'R', department });
      for (let i = 0; i < count; i += 1) {
        seq += 1;
        const user = await User.create({ email: `s${seq}@test.local`, password: 'Password123!', role: 'student', organizationId: school._id });
        const profile = await Profile.create({ user: user._id, firstName: 'S', lastName: String(seq), gender: 'male' });
        await Student.create({ user: user._id, profile: profile._id, school: school._id, class: cls._id, studentId: `ST${String(seq).padStart(4, '0')}` });
      }
      return cls;
    };
    const g4 = await mkClass('Grade 4', primaryDept, 15);
    const g6 = await mkClass('Grade 6', primaryDept, 15);
    const g9 = await mkClass('Grade 9', secondaryDept, 15);
    const g11 = await mkClass('Grade 11', secondaryDept, 15);
    // 60 students, 40 operational seats: only fits because each shift has 30.

    const generate = (body: Record<string, unknown>) => request(app)
      .post('/api/v1/exams/seating-plan/auto-generate').set(auth)
      .send({ academicYear: '2026/27', examType: 'mid', ...body });

    // -------------------------------------------------------------------
    section('Smart generate — Primary and Secondary share both rooms');
    // -------------------------------------------------------------------
    const preview = await generate({ preview: true });
    assert(preview.status === 200, `preview succeeds (status ${preview.status}: ${preview.body?.message || ''})`);
    assert(preview.body?.data?.seatsNeeded === 30, `seats needed is the busiest shift, 30 (got ${preview.body?.data?.seatsNeeded})`);
    const rooms = (preview.body?.data?.roomBreakdown || []) as any[];
    assert(rooms.length === 2 && rooms.every(room => room.peakStudents <= 20), `each room fits 20 per shift (got ${rooms.map(r => `${r.room}:${r.peakStudents}/${r.students}`).join(', ')})`);
    assert(rooms.reduce((sum, room) => sum + room.students, 0) === 60, 'all 60 students are placed');
    assert((preview.body?.data?.issues || []).length === 0, `no capacity issues (got ${JSON.stringify(preview.body?.data?.issues)})`);

    // -------------------------------------------------------------------
    section('Exact reviewed plan — a room holds 15 Primary + 15 Secondary');
    // -------------------------------------------------------------------
    const roomPlan = [
      { classId: String(g4._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g9._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g6._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
      { classId: String(g11._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
    ];
    const confirm = await generate({ roomPlan, roomIds: [String(roomA._id), String(roomB._id)] });
    assert(confirm.status === 200, `30 students in a 20-seat room is accepted across shifts (status ${confirm.status}: ${confirm.body?.message || ''})`);
    assert(await ExamSeatingPlan.countDocuments({ school: school._id, room: roomA._id }) === 30, 'Room A holds 30 assignments (15 per shift)');

    // -------------------------------------------------------------------
    section('Manual add — capacity counts only students in the same shifts');
    // -------------------------------------------------------------------
    const extra = await mkClass('Grade 10', secondaryDept, 1);
    const extraStudent = await Student.findOne({ class: extra._id }).lean() as any;
    const add = await request(app).post('/api/v1/exams/seating-plan').set(auth).send({
      studentId: extraStudent.studentId, room: 'Room A', academicYear: '2026/27', examType: 'mid',
    });
    assert(add.status === 200, `a Secondary student fits next to 15 Secondary in a 22-seat room (status ${add.status}: ${add.body?.message || ''})`);

    // -------------------------------------------------------------------
    section('Overlapping shifts are counted together');
    // -------------------------------------------------------------------
    await ExamSeatingPlan.deleteMany({ school: school._id });
    await ClassModel.deleteOne({ _id: extra._id });
    await Student.deleteMany({ class: extra._id });
    await School.updateOne({ _id: school._id }, { $set: { examSchedulingRules: rulesFor([1, 2]) } });
    const overlap = await generate({ preview: true });
    assert(overlap.status === 400 && /busiest exam shift/.test(overlap.body?.message || ''), `Shift 2 has all 60 students, which does not fit (status ${overlap.status}: ${overlap.body?.message || ''})`);

    // -------------------------------------------------------------------
    section('No Department Shift Assignment — one seat per student, as before');
    // -------------------------------------------------------------------
    await School.updateOne({ _id: school._id }, { $set: { examSchedulingRules: rulesFor(null) } });
    const unassigned = await generate({ preview: true });
    assert(unassigned.status === 400, `60 students do not fit 40 seats when everyone sits together (status ${unassigned.status})`);

    console.log(`\n${'='.repeat(60)}`);
    console.log(failures === 0 ? 'ALL CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
    console.log('='.repeat(60));
  } finally {
    await db.stop();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
