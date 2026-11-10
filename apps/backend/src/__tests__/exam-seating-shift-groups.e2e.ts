/**
 * Room Plan and Auto Allocation share rooms only across disjoint department shifts.
 * Overlapping shifts remain department-exclusive, including immutable locked seats.
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
    // 60 total students, but only 30 sit in any one shift (15 per class).

    const generate = (body: Record<string, unknown>) => request(app)
      .post('/api/v1/exams/seating-plan/auto-generate').set(auth)
      .send({ academicYear: '2026/27', examType: 'mid', ...body });

    // -------------------------------------------------------------------
    section('Smart generate — two rooms are sufficient for the busiest shift');
    // -------------------------------------------------------------------
    const twoRoomPreview = await generate({ preview: true, roomIds: [String(roomA._id), String(roomB._id)] });
    assert(twoRoomPreview.status === 200, `two rooms serve 60 students across non-overlapping shifts (status ${twoRoomPreview.status}: ${twoRoomPreview.body?.message || ''})`);
    assert(twoRoomPreview.body?.data?.seatsNeeded === 30, `capacity is sized for 30 simultaneous students, not 60 total (needed ${twoRoomPreview.body?.data?.seatsNeeded})`);
    const twoRoomBreakdown = (twoRoomPreview.body?.data?.roomBreakdown || []) as any[];
    assert(twoRoomBreakdown.length === 2 && twoRoomBreakdown.every(room => room.peakStudents <= 20), `both rooms remain within operational capacity (got ${twoRoomBreakdown.map(r => `${r.room}:${r.peakStudents}/${r.students}`).join(', ')})`);
    assert(twoRoomBreakdown.reduce((sum, room) => sum + room.students, 0) === 60, 'all 60 students are assigned exactly once in preview');
    assert((twoRoomPreview.body?.data?.issues || []).length === 0, 'no capacity issues when non-overlapping departments reuse rooms');

    // -------------------------------------------------------------------
    section('Exact reviewed plan — Primary and Secondary reuse the same rooms');
    // -------------------------------------------------------------------
    const roomPlan = [
      { classId: String(g4._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g6._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
      { classId: String(g9._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g11._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
    ];
    const confirm = await generate({ roomPlan, roomIds: [String(roomA._id), String(roomB._id)] });
    assert(confirm.status === 200, `Plan Rooms exact quotas are accepted by Auto Allocation (status ${confirm.status}: ${confirm.body?.message || ''})`);
    assert(await ExamSeatingPlan.countDocuments({ school: school._id, room: roomA._id }) === 30, 'Room A is reused by Primary and Secondary across disjoint shifts');
    assert(await ExamSeatingPlan.countDocuments({ school: school._id, room: roomB._id }) === 30, 'Room B is reused by Primary and Secondary across disjoint shifts');
    const savedRows = await ExamSeatingPlan.find({ school: school._id }).populate('student', 'class').lean() as any[];
    assert(savedRows.length === 60 && new Set(savedRows.map(row => String(row.student?._id))).size === 60, 'no student is omitted or duplicated');
    const savedLoad = new Map<string, Map<number, number>>();
    for (const row of savedRows) {
      const classId = String(row.student?.class || '');
      const shifts = classId === String(g4._id) || classId === String(g6._id) ? [0, 1] : [2, 3];
      const roomId = String(row.room);
      const perShift = savedLoad.get(roomId) || new Map<number, number>();
      shifts.forEach(index => perShift.set(index, (perShift.get(index) || 0) + 1));
      savedLoad.set(roomId, perShift);
    }
    assert(Array.from(savedLoad.values()).every(load => Math.max(...load.values()) <= 20), 'saved allocations never exceed operational capacity per shift');

    // -------------------------------------------------------------------
    // -------------------------------------------------------------------
    section('Class-level shifts — classes in one department may use different shifts');
    // -------------------------------------------------------------------
    await ExamSeatingPlan.deleteMany({ school: school._id });
    await School.updateOne({ _id: school._id }, {
      $set: {
        examSchedulingRules: {
          examShiftCount: 4,
          examShifts: SHIFTS,
          departmentShiftAssignments: [],
          classShiftAssignments: [
            { classId: String(g4._id), shiftIndexes: [0] },
            { classId: String(g6._id), shiftIndexes: [1] },
            { classId: String(g9._id), shiftIndexes: [0] },
            { classId: String(g11._id), shiftIndexes: [2] },
          ],
        },
      },
    });
    const classShiftPreview = await generate({
      preview: true,
      roomIds: [String(roomA._id), String(roomB._id)],
    });
    assert(
      classShiftPreview.status === 200 && classShiftPreview.body?.data?.seatsNeeded === 30,
      `class-level shift demand counts only simultaneous classes (status ${classShiftPreview.status}, seats ${classShiftPreview.body?.data?.seatsNeeded})`,
    );

    const classShiftPlan = [
      { classId: String(g4._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g6._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g9._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
      { classId: String(g11._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
    ];
    const classShiftConfirm = await generate({
      roomPlan: classShiftPlan,
      roomIds: [String(roomA._id), String(roomB._id)],
    });
    assert(
      classShiftConfirm.status === 200,
      `Primary and Secondary classes can share a physical room across different shifts while same-shift classes use separate rooms (status ${classShiftConfirm.status}: ${classShiftConfirm.body?.message || ''})`,
    );
    const classShiftRows = await ExamSeatingPlan.find({ school: school._id }).populate('student', 'class').lean() as any[];
    assert(
      classShiftRows.length === 60 && classShiftRows.filter(row => String(row.room) === String(roomA._id)).length === 45,
      'one room is reused by Primary Shift 1, Primary Shift 2 and Secondary Shift 3 classes',
    );

    await ExamSeatingPlan.deleteMany({ school: school._id });
    const sameShiftClassConflict = await generate({
      preview: true,
      roomPlan: [
        { classId: String(g4._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
        { classId: String(g9._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      ],
      roomIds: [String(roomA._id), String(roomB._id)],
    });
    assert(
      sameShiftClassConflict.status === 400,
      'Primary and Secondary classes assigned to the same shift cannot share one room',
    );

    // -------------------------------------------------------------------
    section('Manual add — a department uses an available room');
    // -------------------------------------------------------------------
    const extra = await mkClass('Grade 10', secondaryDept, 1);
    const extraStudent = await Student.findOne({ class: extra._id }).lean() as any;
    const add = await request(app).post('/api/v1/exams/seating-plan').set(auth).send({
      studentId: extraStudent.studentId, room: 'Room C', academicYear: '2026/27', examType: 'mid',
    });
    assert(add.status === 200, `a Secondary student can use its department room (status ${add.status}: ${add.body?.message || ''})`);

    // -------------------------------------------------------------------
    section('Overlapping shifts cannot share a room');
    // -------------------------------------------------------------------
    await ExamSeatingPlan.deleteMany({ school: school._id });
    await ClassModel.deleteOne({ _id: extra._id });
    await Student.deleteMany({ class: extra._id });
    await School.updateOne({ _id: school._id }, { $set: { examSchedulingRules: rulesFor([1, 2]) } });
    const overlappingPlan = [
      { classId: String(g4._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g9._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g6._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
      { classId: String(g11._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
    ];
    const overlapRejected = await generate({ preview: true, roomPlan: overlappingPlan, roomIds: [String(roomA._id), String(roomB._id)] });
    assert(overlapRejected.status === 400, `same room is rejected when department shifts overlap (status ${overlapRejected.status})`);

    // Locked rows from two departments may not silently preserve a new shift conflict.
    const primaryStudent = await Student.findOne({ class: g4._id }).lean() as any;
    const secondaryStudent = await Student.findOne({ class: g9._id }).lean() as any;
    await ExamSeatingPlan.create([
      { student: primaryStudent._id, room: roomA._id, deskNumber: 'L-1', academicYear: '2026/27', examType: 'mid', school: school._id, locked: true },
      { student: secondaryStudent._id, room: roomA._id, deskNumber: 'L-2', academicYear: '2026/27', examType: 'mid', school: school._id, locked: true },
    ]);
    const lockedConflict = await generate({ preview: true, overwrite: true, roomIds: [String(roomA._id), String(roomB._id), String(roomC._id), String(roomD._id)] });
    assert(lockedConflict.status === 400 && String(lockedConflict.body?.message || '').includes('Locked assignments conflict'), `locked cross-department overlap is rejected (status ${lockedConflict.status})`);
    await ExamSeatingPlan.deleteMany({ school: school._id });

    // -------------------------------------------------------------------
    section('No Department Shift Assignment — safe fallback keeps departments isolated');
    // -------------------------------------------------------------------
    await School.updateOne({ _id: school._id }, { $set: { examSchedulingRules: rulesFor(null) } });
    const unassigned = await generate({ preview: true, roomIds: [String(roomA._id), String(roomB._id), String(roomC._id), String(roomD._id)] });
    assert(unassigned.status === 200, `both departments still receive separate rooms without shift assignments (status ${unassigned.status}: ${unassigned.body?.message || ''})`);

    // -------------------------------------------------------------------
    section('Invalid/missing department assignment — safe all-shifts fallback');
    // -------------------------------------------------------------------
    await School.updateOne({ _id: school._id }, {
      $set: {
        examSchedulingRules: {
          examShiftCount: 4,
          examShifts: SHIFTS,
          departmentShiftAssignments: [
            { departmentId: String(primaryDept), shiftIndexes: [0, 1] },
          ],
        },
      },
    });
    const invalidFallbackPlan = [
      { classId: String(g4._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g9._id), quotas: [{ roomId: String(roomA._id), count: 15 }] },
      { classId: String(g6._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
      { classId: String(g11._id), quotas: [{ roomId: String(roomB._id), count: 15 }] },
    ];
    const invalidFallbackRejected = await generate({
      preview: true,
      roomPlan: invalidFallbackPlan,
      roomIds: [String(roomA._id), String(roomB._id), String(roomC._id), String(roomD._id)],
    });
    assert(
      invalidFallbackRejected.status === 400
        && String(invalidFallbackRejected.body?.message || '').includes('different departments during'),
      `a department without a valid assignment falls back to all shifts and cannot share Primary rooms (status ${invalidFallbackRejected.status}: ${invalidFallbackRejected.body?.message || ''})`,
    );
    await ExamSeatingPlan.deleteMany({ school: school._id });

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
