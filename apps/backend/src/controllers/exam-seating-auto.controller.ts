import { Request, Response } from 'express';
import ExamSeatingPlan from '../models/exam-seating-plan.model';
import ExamRoom from '../models/exam-room.model';
import Student from '../models/student.model';
import ClassModel from '../models/class.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import { assertOwnOrg } from '../utils/tenant-scope';

const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
const key = (v: unknown) => norm(v).toLowerCase();
const examTypeValue = (v: string) => {
  const x = key(v);
  if (x === 'mid' || x === 'mid exam' || x === 'midterm') return 'mid';
  if (x === 'final' || x === 'final exam') return 'final';
  return '';
};
const classLabel = (s: any) => norm([s?.class?.title, s?.class?.section].filter(Boolean).join(' '));
const departmentLabel = (s: any) => norm(s?.class?.department?.name || s?.department?.name || s?.department || '');
const shiftLabel = (s: any) => norm(s?.class?.shiftMode || s?.shiftMode || '');

function roundRobinMix(students: any[]): any[] {
  const buckets = new Map<string, any[]>();
  for (const student of students) {
    const id = String(student.class?._id || student.class || 'unclassified');
    const bucket = buckets.get(id) || [];
    bucket.push(student);
    buckets.set(id, bucket);
  }

  // Stable shuffle inside each class prevents one class from owning a whole
  // room while round-robin interleaving keeps different classes mixed.
  for (const bucket of buckets.values()) {
    for (let i = bucket.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
  }

  const mixed: any[] = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const bucket of buckets.values()) {
      const next = bucket.shift();
      if (next) {
        mixed.push(next);
        remaining = true;
      }
    }
  }
  return mixed;
}

export const generate = async (req: Request, res: Response) => {
  const {
    academicYear,
    examType,
    maxPerRoom = 12,
    seatMode = 'none',
    overwrite = false,
    organization = '',
    department = '',
    departmentIds = [],
    classIds = [],
    shift = '',
  } = req.body as any;

  const year = norm(academicYear);
  const type = examTypeValue(norm(examType));
  const perRoom = Number(maxPerRoom);
  if (!year) throw new BadRequestError('Academic Year is required');
  if (!type) throw new BadRequestError('Exam Type must be Mid Exam or Final');
  if (!Number.isInteger(perRoom) || perRoom < 10 || perRoom > 15) {
    throw new BadRequestError('Students per room must be between 10 and 15');
  }
  if (!['none', 'sequential'].includes(seatMode)) throw new BadRequestError('Invalid seat mode');

  const schoolId = (req.user as any)?.schoolId || null;
  let targetSchoolId = schoolId;
  if (organization) {
    targetSchoolId = norm(organization);
  }
  if (req.user?.role === 'org_admin') {
    targetSchoolId = (req.user as any)?.organizationId || schoolId || null;
  }

  const classFilter: any = { status: 'active' };
  if (targetSchoolId) classFilter.school = targetSchoolId;
  if (Array.isArray(classIds) && classIds.length) classFilter._id = { $in: classIds };
  else if (Array.isArray(departmentIds) && departmentIds.length) classFilter.department = { $in: departmentIds };
  else if (department) classFilter.department = department;

  const targetClasses = await ClassModel.find(classFilter)
    .select('_id title section department shiftMode room school')
    .populate('department', 'name')
    .lean() as any[];

  if (!targetClasses.length) throw new BadRequestError('No active classes matched the selected filters');

  const classIdsForStudents = targetClasses.map(c => c._id);
  const studentQuery: any = { status: 'active', class: { $in: classIdsForStudents } };
  if (targetSchoolId) studentQuery.school = targetSchoolId;

  const students = await Student.find(studentQuery)
    .populate('profile', 'firstName lastName')
    .populate('school', 'name')
    .populate({ path: 'class', select: 'title section academicYear shiftMode department room', populate: { path: 'department', select: 'name' } })
    .lean() as any[];

  students.forEach(s => { if (s.school) assertOwnOrg(req, s, 'school'); });

  const selected = students.filter(s =>
    (!organization || key(s.school?.name) === key(organization) || String(s.school?._id) === String(organization)) &&
    (!department || key(departmentLabel(s)) === key(department)) &&
    (!shift || key(shiftLabel(s)) === key(shift))
  );
  if (!selected.length) throw new BadRequestError('No active students matched the selected filters');

  // A class's existing Room value is the source of truth for the exam-room
  // pool. The class-management workflow auto-creates these rooms, while the
  // Rooms manager is where capacity/building can be adjusted.
  const roomNames = Array.from(new Set(targetClasses.map(c => norm(c.room)).filter(Boolean)));
  if (!roomNames.length) throw new BadRequestError('The selected classes have no Rooms configured');

  const roomQuery: any = { name: { $in: roomNames } };
  if (targetSchoolId) roomQuery.school = targetSchoolId;
  const rooms = await ExamRoom.find(roomQuery).sort({ name: 1 }).lean();
  rooms.forEach(r => assertOwnOrg(req, r, 'school'));
  const foundRoomNames = new Set(rooms.map(r => key(r.name)));
  const missingRooms = roomNames.filter(name => !foundRoomNames.has(key(name)));
  if (missingRooms.length) {
    throw new BadRequestError(`Room records are missing for: ${missingRooms.join(', ')}. Open Rooms and create/fix those rooms first.`);
  }

  const effectiveRoomCapacity = (room: any) => Math.min(Number(room.capacity) || 0, perRoom);
  const usableCapacity = rooms.reduce((sum, room) => sum + effectiveRoomCapacity(room), 0);
  if (usableCapacity < selected.length) {
    throw new BadRequestError(`Not enough usable room capacity. ${selected.length} students need ${Math.ceil(selected.length / perRoom)} groups of ${perRoom} or fewer, but the selected class rooms provide ${usableCapacity} usable seats.`);
  }

  const mixed = roundRobinMix(selected);
  const groups: any[][] = [];
  let cursor = 0;
  for (const room of rooms) {
    const capacity = effectiveRoomCapacity(room);
    if (capacity <= 0) continue;
    const group = mixed.slice(cursor, cursor + capacity);
    cursor += group.length;
    if (group.length) groups.push(group);
    if (cursor >= mixed.length) break;
  }

  const scope: any = { academicYear: year, examType: type, school: targetSchoolId || null };
  const selectedIds = selected.map(s => s._id);
  const existing = await ExamSeatingPlan.countDocuments({ ...scope, student: { $in: selectedIds } });
  if (existing && !overwrite) {
    throw new BadRequestError(`Some selected students already have seating for ${year} / ${type}. Enable Regenerate existing plan to replace their assignments.`);
  }
  if (overwrite) await ExamSeatingPlan.deleteMany({ ...scope, student: { $in: selectedIds } });

  const docs: any[] = [];
  groups.forEach((group, roomIndex) => group.forEach((student, index) => docs.push({
    student: student._id,
    room: rooms[roomIndex]._id,
    deskNumber: seatMode === 'sequential' ? `S${String(index + 1).padStart(2, '0')}` : '',
    academicYear: year,
    examType: type,
    school: targetSchoolId || student.school?._id || null,
  })));

  await ExamSeatingPlan.insertMany(docs);
  return ApiResponse.success(res, {
    academicYear: year,
    examType: type,
    students: selected.length,
    rooms: groups.length,
    studentsPerRoom: perRoom,
    seatMode,
    mixedClasses: true,
    selectedClasses: targetClasses.map(c => ({ _id: c._id, name: norm([c.title, c.section].filter(Boolean).join(' ')), room: c.room })),
    roomBreakdown: groups.map((g, i) => ({
      room: rooms[i].name,
      capacity: rooms[i].capacity,
      students: g.length,
      classes: Array.from(new Set(g.map(s => classLabel(s)).filter(Boolean))),
    })),
  }, `Generated seating for ${selected.length} students across ${groups.length} mixed-class rooms`);
};
