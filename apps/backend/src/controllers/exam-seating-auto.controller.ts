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

function roomReport(rooms: any[], assignments: any[]) {
  return rooms.map(room => {
    const assigned = assignments.filter(a => String(a.roomId) === String(room._id));
    const capacity = Math.max(0, Number(room.capacity) || 0);
    return {
      roomId: room._id,
      room: room.name,
      building: room.building,
      capacity,
      students: assigned.length,
      remainingCapacity: Math.max(capacity - assigned.length, 0),
      classes: classCounts(assigned.map(a => a.student)),
    };
  });
}

function balancedRoomTargets(rooms: any[], studentCount: number): Map<string, number> {
  const targets = new Map<string, number>();
  rooms.forEach(room => targets.set(String(room._id), 0));

  let remaining = studentCount;
  while (remaining > 0) {
    const available = rooms
      .filter(room => (targets.get(String(room._id)) || 0) < Math.max(0, Number(room.capacity) || 0))
      .sort((a, b) => {
        const aCount = targets.get(String(a._id)) || 0;
        const bCount = targets.get(String(b._id)) || 0;
        return aCount - bCount
          || (Number(b.capacity) || 0) - (Number(a.capacity) || 0)
          || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
      });

    if (!available.length) break;
    const room = available[0];
    const id = String(room._id);
    targets.set(id, (targets.get(id) || 0) + 1);
    remaining -= 1;
  }

  return targets;
}

export const generate = async (req: Request, res: Response) => {
  const {
    academicYear,
    examType,
    overwrite = false,
    organization = '',
    department = '',
    departmentIds = [],
    classIds = [],
    roomIds = [],
    shift = '',
  } = req.body as any;

  const year = norm(academicYear);
  const type = examTypeValue(norm(examType));
  if (!year) throw new BadRequestError('Academic Year is required');
  if (!type) throw new BadRequestError('Exam Type must be Mid Exam or Final');

  let targetSchoolId: string | null = null;
  if (req.user?.role === 'org_admin') {
    targetSchoolId = String((req.user as any)?.organizationId?._id || (req.user as any)?.organizationId || '');
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
  const normalizedRoomIds = Array.isArray(roomIds)
    ? roomIds.filter((id: unknown) => mongoose.isValidObjectId(String(id))).map(String)
    : [];

  const classFilter: any = { status: 'active', school: targetSchoolId };
  if (normalizedClassIds.length) classFilter._id = { $in: normalizedClassIds };
  if (normalizedDepartmentIds.length) classFilter.department = { $in: normalizedDepartmentIds };
  else if (department) classFilter.department = department;

  const targetClasses = await ClassModel.find(classFilter)
    .select('_id title section department shiftMode room school')
    .populate('department', 'name')
    .sort({ title: 1, section: 1 })
    .lean() as any[];

  if (!targetClasses.length) throw new BadRequestError('Select at least one active Grade / Class');

  const classIdsForStudents = targetClasses.map(c => c._id);
  const students = await Student.find({
    status: 'active',
    class: { $in: classIdsForStudents },
    school: targetSchoolId,
  })
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
  if (!selected.length) throw new BadRequestError('No active students matched the selected Grade / Class selection');

  let selectedRooms: any[] = [];
  if (normalizedRoomIds.length) {
    selectedRooms = await ExamRoom.find({
      school: targetSchoolId,
      _id: { $in: normalizedRoomIds },
      capacity: { $gt: 0 },
    }).sort({ building: 1, name: 1 }).lean();

    if (selectedRooms.length !== normalizedRoomIds.length) {
      throw new BadRequestError('One or more selected Rooms are missing, inactive, or have no capacity');
    }
  } else {
    // Backward-compatible fallback for older clients: use class-linked rooms.
    const roomNames = Array.from(new Set(targetClasses.map(c => norm(c.room)).filter(Boolean)));
    if (roomNames.length) {
      selectedRooms = await ExamRoom.find({
        school: targetSchoolId,
        name: { $in: roomNames },
        capacity: { $gt: 0 },
      }).sort({ building: 1, name: 1 }).lean();
    }
    if (!selectedRooms.length) {
      selectedRooms = await ExamRoom.find({
        school: targetSchoolId,
        capacity: { $gt: 0 },
      }).sort({ building: 1, name: 1 }).lean();
    }
  }

  selectedRooms.forEach(r => assertOwnOrg(req, r, 'school'));
  if (!selectedRooms.length) throw new BadRequestError('Select at least one Room with a valid capacity');

  const totalCapacity = selectedRooms.reduce((sum, room) => sum + Math.max(0, Number(room.capacity) || 0), 0);
  if (totalCapacity < selected.length) {
    throw new BadRequestError(
      `Insufficient room capacity: ${selected.length} students selected but the chosen rooms hold only ${totalCapacity}. Add another room or increase room capacity.`
    );
  }

  // Mix students by class first (G12 → G11 → G10 → ... style), then divide
  // the mixed list into room targets whose headcounts are as equal as room
  // capacities permit. Seat numbers are intentionally not part of this flow.
  const mixed = roundRobinMix(selected);
  const targets = balancedRoomTargets(selectedRooms, mixed.length);
  const assignments: Array<{ roomId: any; student: any; seat: string }> = [];
  let cursor = 0;

  for (const room of selectedRooms) {
    const target = targets.get(String(room._id)) || 0;
    const group = mixed.slice(cursor, cursor + target);
    cursor += group.length;
    group.forEach(student => assignments.push({
      roomId: room._id,
      student,
      seat: '',
    }));
  }

  if (assignments.length !== selected.length) {
    throw new BadRequestError('Could not place every selected student into the chosen rooms');
  }

  const scope: any = { academicYear: year, examType: type, school: targetSchoolId };
  const selectedIds = selected.map(s => s._id);
  const existing = await ExamSeatingPlan.countDocuments({ ...scope, student: { $in: selectedIds } });
  if (existing && !overwrite) {
    throw new BadRequestError(
      `Some selected students already have room assignments for ${year} / ${type}. Enable Regenerate existing assignments to rebalance them.`
    );
  }
  if (overwrite) {
    await ExamSeatingPlan.deleteMany({ ...scope, student: { $in: selectedIds } });
  }

  const docs: any[] = assignments.map(a => ({
    student: a.student._id,
    room: a.roomId,
    // Internal deterministic placeholder only; the model hides it from JSON.
    deskNumber: `__ROOM_ONLY__${String(a.student._id)}`,
    academicYear: year,
    examType: type,
    school: targetSchoolId,
  }));

  await ExamSeatingPlan.insertMany(docs);

  const breakdown = roomReport(selectedRooms, assignments);
  const assignedByClass = classCounts(assignments.map(a => a.student));

  return ApiResponse.success(res, {
    academicYear: year,
    examType: type,
    students: selected.length,
    assigned: assignments.length,
    remaining: 0,
    rooms: breakdown.length,
    mixedClasses: true,
    roomOnly: true,
    totalCapacity,
    selectedClasses: targetClasses.map(c => ({
      _id: c._id,
      name: norm([c.title, c.section].filter(Boolean).join(' ')),
    })),
    classBreakdown: assignedByClass,
    roomBreakdown: breakdown,
  }, `Assigned ${selected.length} students across ${breakdown.length} balanced mixed-grade rooms`);
};
