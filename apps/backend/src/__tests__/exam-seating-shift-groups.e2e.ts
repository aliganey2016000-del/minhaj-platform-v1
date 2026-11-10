/**
 * Room Plan — each department receives an exclusive set of rooms.
 *
 * With Department Shift Assignment (Primary: Shift 1-2, Secondary: Shift 3-4),
 * Primary and Secondary use separate rooms even though their shifts do not
 * overlap. The same isolation is enforced when shifts overlap or are unassigned.
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

    // Four rooms of 22 seats (20 operational after the default 2 reserve seats).
    const roomA = await ExamRoom.create({ name: 'Room A', capacity: 22, school: school._id, createdBy: admin._id });
    const roomB = await ExamRoom.create({ name: 'Room B', capacity: 22, school: school._id, createdBy: admin._id });
    const roomC = await ExamRoom.create({ name: 'Room C', capacity: 22, school: school._id, createdBy: admin._id });
    const roomD = await ExamRoom.create({ name: 'Room D', capacity: 22, school: school._id, createdBy: admin._id });

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
    // 60 students require 60 operational seats because departments cannot share rooms.

    const generate = (body: Record<string, unknown>) => request(app)
      .post('/api/v1/exams/seating-plan/auto-generate').set(auth)
      .send({ academicYear: '2026/27', examType: 'mid', ...body });

    // -------------------------------------------------------------------
    section('Smart generate — departments require separate room pools');
    // -------------------------------------------------------------------
    const insufficient = await generate({ preview: true, roomIds: [String(roomA._id), String(roomB._id)] });
    assert(insufficient.status === 400, `two rooms cannot serve 60 students across separate departments (status ${insufficient.status})`);
    const preview = await generate({ preview: true, roomIds: [String(roomA._id), String(roomB._id), String(roomC._id), String(roomD._id)] });
    assert(preview.status === 200, `preview succeeds with four rooms (status ${preview.status}: ${preview.body?.message || ''})`);
    const rooms = (preview.body?.data?.roomBreakdown || []) as any[];
    assert(rooms.length === 4 && rooms.every(room => room.peakStudents <= 20), `each room stays within operational capacity (got ${rooms.map(r => `${r.room}:${r.peakStudents}/${r.students}`).join(', ')})`);
    assert(rooms.reduce((sum, room) => sum + room.students, 0) === 60, 'all 60 students are placed');
    assert((preview.body?.data?.issues || []).length === 0, `no capacity issues (got ${JSON.stringify(preview.body?.data?.issues)})`);

    // -------------------------------------------------------------------
    section('Exact reviewed plan — each department owns separate rooms');
    // -------------------------------------------------------------------
    const roomPlan = [
      { classId: String(g4._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g6._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
      { classId: String(g9._id), quotas: [{ roomId: String(roomC._id), count: 15 }] },
      { classId: String(g11._id), quotas: [{ roomId: String(roomD._id), count: 15 }] },
    ];
    const confirm = await generate({ roomPlan, roomIds: [String(roomA._id), String(roomB._id), String(roomC._id), String(roomD._id)] });
    assert(confirm.status === 200, `department-isolated room plan is accepted (status ${confirm.status}: ${confirm.body?.message || ''})`);
    assert(await ExamSeatingPlan.countDocuments({ school: school._id, room: roomA._id }) === 15, 'Room A contains Primary students only');
    assert(await ExamSeatingPlan.countDocuments({ school: school._id, room: roomC._id }) === 15, 'Room C contains Secondary students only');

    // -------------------------------------------------------------------
    section('Manual add — a department uses its own allocated room');
    // -------------------------------------------------------------------
    const extra = await mkClass('Grade 10', secondaryDept, 1);
    const extraStudent = await Student.findOne({ class: extra._id }).lean() as any;
    const add = await request(app).post('/api/v1/exams/seating-plan').set(auth).send({
      studentId: extraStudent.studentId, room: 'Room C', academicYear: '2026/27', examType: 'mid',
    });
    assert(add.status === 200, `a Secondary student can use its department room (status ${add.status}: ${add.body?.message || ''})`);

    // -------------------------------------------------------------------
    section('Overlapping shifts still keep departments in separate rooms');
    // -------------------------------------------------------------------
    await ExamSeatingPlan.deleteMany({ school: school._id });
    await ClassModel.deleteOne({ _id: extra._id });
    await Student.deleteMany({ class: extra._id });
    await School.updateOne({ _id: school._id }, { $set: { examSchedulingRules: rulesFor([1, 2]) } });
    const overlap = await generate({ preview: true, roomIds: [String(roomA._id), String(roomB._id), String(roomC._id), String(roomD._id)] });
    assert(overlap.status === 200, `overlapping shifts still fit because departments have separate room pools (status ${overlap.status}: ${overlap.body?.message || ''})`);

    // -------------------------------------------------------------------
    section('No Department Shift Assignment — departments remain isolated');
    // -------------------------------------------------------------------
    await School.updateOne({ _id: school._id }, { $set: { examSchedulingRules: rulesFor(null) } });
    const unassigned = await generate({ preview: true, roomIds: [String(roomA._id), String(roomB._id), String(roomC._id), String(roomD._id)] });
    assert(unassigned.status === 200, `both departments still receive separate rooms without shift assignments (status ${unassigned.status}: ${unassigned.body?.message || ''})`);

    // -------------------------------------------------------------------
    section('Legacy classes — fall back to Student.department for room ownership');
    // -------------------------------------------------------------------
    const mkLegacyClass = async (title: string, departmentName: string, count: number) => {
      const cls = await ClassModel.create({ school: school._id, title, section: 'A', room: 'R' });
      for (let i = 0; i < count; i += 1) {
        seq += 1;
        const user = await User.create({ email: `legacy${seq}@test.local`, password: 'Password123!', role: 'student', organizationId: school._id });
        const profile = await Profile.create({ user: user._id, firstName: 'Legacy', lastName: String(seq), gender: 'male' });
        await Student.create({
          user: user._id, profile: profile._id, school: school._id, class: cls._id,
          department: departmentName, studentId: `LG${String(seq).padStart(4, '0')}`,
        });
      }
      return cls;
    };
    const legacyPrimary = await mkLegacyClass('Legacy Grade 3', 'Primary', 5);
    const legacySecondary = await mkLegacyClass('Legacy Grade 10', 'Secondary', 5);
    const legacyConfirm = await generate({
      preview: false,
      classIds: [String(legacyPrimary._id), String(legacySecondary._id)],
      roomIds: [String(roomA._id), String(roomB._id), String(roomC._id), String(roomD._id)],
    });
    assert(legacyConfirm.status === 200, `legacy students allocate using Student.department fallback (status ${legacyConfirm.status}: ${legacyConfirm.body?.message || ''})`);
    const legacyRows = await ExamSeatingPlan.find({ school: school._id })
      .populate({ path: 'student', select: 'department class', populate: { path: 'class', select: 'title' } })
      .lean() as any[];
    const departmentsByRoom = new Map<string, Set<string>>();
    legacyRows.forEach(row => {
      const roomId = String(row.room);
      const departmentName = String(row.student?.department || 'Unassigned');
      const departments = departmentsByRoom.get(roomId) || new Set<string>();
      departments.add(departmentName);
      departmentsByRoom.set(roomId, departments);
    });
    assert(
      Array.from(departmentsByRoom.values()).every(departments => departments.size <= 1),
      'no Room contains students from both Primary and Secondary when Class.department is missing',
    );

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
