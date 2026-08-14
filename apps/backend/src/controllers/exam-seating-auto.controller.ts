import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ExamSeatingPlan from '../models/exam-seating-plan.model';
import ExamRoom from '../models/exam-room.model';
import Student from '../models/student.model';
import ClassModel from '../models/class.model';
import School from '../models/school.model';
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

const effectiveCapacity = (room: any, perRoom: number) =>
  Math.min(Number(room.capacity) || 0, perRoom);

function classCounts(students: any[]) {
  const counts = new Map<string, number>();
  for (const student of students) {
    const label = classLabel(student) || 'Unclassified';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function roomReport(rooms: any[], assignments: any[], perRoom: number) {
  return rooms.map(room => {
    const assigned = assignments.filter(a => String(a.roomId) === String(room._id));
    return {
      roomId: room._id,
      room: room.name,
      building: room.building,
      capacity: Number(room.capacity) || 0,
      usableCapacity: effectiveCapacity(room, perRoom),
      students: assigned.length,
      remainingCapacity: Math.max(effectiveCapacity(room, perRoom) - assigned.length, 0),
      classes: classCounts(assigned.map(a => a.student)),
      source: room.source || 'class-room',
    };
  });
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

  let targetSchoolId: string | null = null;
  if (req.user?.role === 'org_admin') {
    targetSchoolId = String((req.user as any)?.organizationId || '');
  } else if (req.user?.role === 'admin') {
    targetSchoolId = norm(organization) || null;
  }
  if (!targetSchoolId || !mongoose.isValidObjectId(targetSchoolId)) {
    throw new BadRequestError('A valid Organization is required');
  }

  const school = await School.findById(targetSchoolId).select('_id').lean();
  if (!school) throw new BadRequestError('Selected Organization was not found');

  const normalizedDepartmentIds = Array.isArray(departmentIds)
    ? departmentIds.filter((id: unknown) => mongoose.isValidObjectId(String(id))).map(String)
    : [];
  const normalizedClassIds = Array.isArray(classIds)
    ? classIds.filter((id: unknown) => mongoose.isValidObjectId(String(id))).map(String)
    : [];

  const classFilter: any = { status: 'active', school: targetSchoolId };
  if (normalizedClassIds.length) classFilter._id = { $in: normalizedClassIds };
  if (normalizedDepartmentIds.length) classFilter.department = { $in: normalizedDepartmentIds };
  else if (department) classFilter.department = department;

  const targetClasses = await ClassModel.find(classFilter)
    .select('_id title section department shiftMode room school')
    .populate('department', 'name')
    .lean() as any[];

  if (!targetClasses.length) throw new BadRequestError('No active classes matched the selected filters');

  const classIdsForStudents = targetClasses.map(c => c._id);
  const studentQuery: any = {
    status: 'active',
    class: { $in: classIdsForStudents },
    school: targetSchoolId,
  };

  const students = await Student.find(studentQuery)
    .populate('profile', 'firstName lastName')
    .populate('school', 'name')
    .populate({
      path: 'class',
      select: 'title section academicYear shiftMode department room school',
      populate: { path: 'department', select: 'name' },
    })
    .lean() as any[];

  students.forEach(s => { if (s.school) assertOwnOrg(req, s, 'school'); });

  const selected = students.filter(s =>
    String(s.school?._id || s.school) === targetSchoolId &&
    (!organization || String(s.school?._id || s.school) === targetSchoolId) &&
    (!department || key(departmentLabel(s)) === key(department)) &&
    (!shift || key(shiftLabel(s)) === key(shift))
  );
  if (!selected.length) throw new BadRequestError('No active students matched the selected filters');

  const roomNames = Array.from(new Set(targetClasses.map(c => norm(c.room)).filter(Boolean)));
  if (!roomNames.length) throw new BadRequestError('The selected classes have no Rooms configured');

  const roomQuery: any = { school: targetSchoolId, name: { $in: roomNames } };
  const configuredClassRooms = await ExamRoom.find(roomQuery).sort({ building: 1, name: 1 }).lean();
  configuredClassRooms.forEach(r => assertOwnOrg(req, r, 'school'));

  const roomsByName = new Map<string, any[]>();
  for (const room of configuredClassRooms) {
    const list = roomsByName.get(key(room.name)) || [];
    list.push(room);
    roomsByName.set(key(room.name), list);
  }

  const missingRooms = roomNames.filter(name => !roomsByName.has(key(name)));
  if (missingRooms.length) {
    throw new BadRequestError(`Room records are missing for: ${missingRooms.join(', ')}. Open Rooms and create/fix those rooms first.`);
  }

  const ambiguousRooms = roomNames.filter(name => (roomsByName.get(key(name)) || []).length > 1);
  if (ambiguousRooms.length) {
    throw new BadRequestError(`Room names are ambiguous across buildings: ${ambiguousRooms.join(', ')}. Each class must point to one physical room before seating can be generated.`);
  }

  const classRooms = roomNames
    .map(name => roomsByName.get(key(name))?.[0])
    .filter(Boolean)
    .map(room => ({ ...room, source: 'class-room' }));

  // One exam group occupies one physical room. The configured room capacity
  // is still preserved for reporting, but the administrator's 10–15 group
  // limit is the usable capacity for this seating run.
  let selectedRooms = [...classRooms];
  let usableCapacity = selectedRooms.reduce((sum, room) => sum + effectiveCapacity(room, perRoom), 0);
  const requiredGroups = Math.ceil(selected.length / perRoom);

  // If the classes' assigned rooms cannot hold everyone, automatically add
  // unused rooms from the same organization. This solves the common case
  // where class rooms are insufficient while keeping the class-room mapping
  // as the primary source of truth.
  if (usableCapacity < selected.length) {
    const selectedRoomIds = new Set(selectedRooms.map(room => String(room._id)));
    const additionalRooms = await ExamRoom.find({
      school: targetSchoolId,
      _id: { $nin: Array.from(selectedRoomIds).map(id => new mongoose.Types.ObjectId(id)) },
      capacity: { $gt: 0 },
    })
      .sort({ capacity: -1, building: 1, name: 1 })
      .lean();

    additionalRooms.forEach(r => assertOwnOrg(req, r, 'school'));
    for (const room of additionalRooms) {
      if (usableCapacity >= selected.length) break;
      selectedRooms.push({ ...room, source: 'additional-room' });
      usableCapacity += effectiveCapacity(room, perRoom);
    }
  }

  if (usableCapacity < selected.length) {
    const currentlyUsable = selectedRooms.reduce((sum, room) => sum + effectiveCapacity(room, perRoom), 0);
    const remaining = selected.length - currentlyUsable;
    const report = selectedRooms.map(room => `${room.name} (${room.building}) ${effectiveCapacity(room, perRoom)} usable`).join('; ');
    throw new BadRequestError(
      `SEATING CAPACITY SHORTAGE | Students: ${selected.length} | Required groups: ${requiredGroups} | Usable capacity: ${currentlyUsable} | Remaining students: ${remaining} | Rooms: ${report} | Resolution: add/select at least ${Math.ceil(remaining / perRoom)} more usable room(s) or reduce the student scope.`
    );
  }

  const mixed = roundRobinMix(selected);
  const assignments: Array<{ roomId: any; student: any; seat: string }> = [];
  let cursor = 0;
  for (const room of selectedRooms) {
    const capacity = effectiveCapacity(room, perRoom);
    if (capacity <= 0) continue;
    const group = mixed.slice(cursor, cursor + capacity);
    cursor += group.length;
    group.forEach((student, index) => assignments.push({
      roomId: room._id,
      student,
      seat: seatMode === 'sequential' ? `S${String(index + 1).padStart(2, '0')}` : '',
    }));
    if (cursor >= mixed.length) break;
  }

  if (cursor !== selected.length) {
    throw new BadRequestError('The seating generator could not assign every selected student. Increase the available room capacity or select additional rooms.');
  }

  const scope: any = { academicYear: year, examType: type, school: targetSchoolId };
  const selectedIds = selected.map(s => s._id);
  const existing = await ExamSeatingPlan.countDocuments({ ...scope, student: { $in: selectedIds } });
  if (existing && !overwrite) {
    throw new BadRequestError(`Some selected students already have seating for ${year} / ${type}. Enable Regenerate existing plan to replace their assignments.`);
  }
  if (overwrite) await ExamSeatingPlan.deleteMany({ ...scope, student: { $in: selectedIds } });

  const docs: any[] = assignments.map(a => ({
    student: a.student._id,
    room: a.roomId,
    deskNumber: a.seat,
    academicYear: year,
    examType: type,
    school: targetSchoolId,
  }));

  await ExamSeatingPlan.insertMany(docs);

  const breakdown = roomReport(selectedRooms, assignments, perRoom);
  const assignedByClass = classCounts(assignments.map(a => a.student));

  return ApiResponse.success(res, {
    academicYear: year,
    examType: type,
    students: selected.length,
    assigned: assignments.length,
    remaining: selected.length - assignments.length,
    requiredGroups,
    rooms: breakdown.length,
    studentsPerRoom: perRoom,
    seatMode,
    mixedClasses: true,
    totalConfiguredCapacity: selectedRooms.reduce((sum, room) => sum + (Number(room.capacity) || 0), 0),
    totalUsableCapacity: usableCapacity,
    additionalRoomsUsed: breakdown.filter(r => r.source === 'additional-room').length,
    selectedClasses: targetClasses.map(c => ({
      _id: c._id,
      name: norm([c.title, c.section].filter(Boolean).join(' ')),
      room: c.room,
    })),
    classBreakdown: assignedByClass,
    roomBreakdown: breakdown,
  }, `Generated seating for ${selected.length} students across ${breakdown.length} mixed-class rooms`);
};
