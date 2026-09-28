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

function hashSeed(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function roundRobinMix(students: any[], seed: string): any[] {
  const random = mulberry32(hashSeed(seed || 'room-allocation'));
  const buckets = new Map<string, any[]>();

  for (const student of students) {
    const id = String(student.class?._id || student.class || 'unclassified');
    const bucket = buckets.get(id) || [];
    bucket.push(student);
    buckets.set(id, bucket);
  }

  const entries = shuffle(
    Array.from(buckets.entries()).map(([id, bucket]) => [
      id,
      shuffle(
        bucket.slice().sort((a, b) =>
          String(a.studentId || a._id).localeCompare(String(b.studentId || b._id), undefined, { numeric: true })
        ),
        random,
      ),
    ] as [string, any[]]),
    random,
  );

  const mixed: any[] = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const [, bucket] of entries) {
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
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function distributionMap(students: any[]) {
  const map = new Map<string, number>();
  for (const student of students) {
    const label = classLabel(student) || 'Unclassified';
    map.set(label, (map.get(label) || 0) + 1);
  }
  return map;
}

function roomBalanceScore(roomStudents: any[], allStudents: any[]): number {
  if (!roomStudents.length || !allStudents.length) return 100;
  const room = distributionMap(roomStudents);
  const global = distributionMap(allStudents);
  const labels = new Set([...room.keys(), ...global.keys()]);
  let totalVariation = 0;

  for (const label of labels) {
    const roomShare = (room.get(label) || 0) / roomStudents.length;
    const globalShare = (global.get(label) || 0) / allStudents.length;
    totalVariation += Math.abs(roomShare - globalShare);
  }

  return Math.max(0, Math.min(100, Math.round((1 - totalVariation / 2) * 100)));
}

function roomReport(rooms: any[], assignments: any[], allStudents: any[]) {
  return rooms.map(room => {
    const assigned = assignments.filter(a => String(a.roomId) === String(room._id));
    const capacity = Math.max(0, Number(room.capacity) || 0);
    const roomStudents = assigned.map(a => a.student);
    const score = roomBalanceScore(roomStudents, allStudents);

    return {
      roomId: room._id,
      room: room.name,
      building: room.building,
      capacity,
      students: assigned.length,
      remainingCapacity: Math.max(capacity - assigned.length, 0),
      locked: assigned.filter(a => a.locked).length,
      balanceScore: score,
      balanceLabel: score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : 'Needs Review',
      classes: classCounts(roomStudents),
    };
  });
}

function balancedRoomTargets(
  rooms: any[],
  studentsToPlace: number,
  initialCounts: Map<string, number>,
  frozenRoomIds: Set<string>,
): Map<string, number> {
  const targets = new Map<string, number>();
  rooms.forEach(room => targets.set(String(room._id), initialCounts.get(String(room._id)) || 0));

  let remaining = studentsToPlace;
  while (remaining > 0) {
    const available = rooms
      .filter(room =>
        !frozenRoomIds.has(String(room._id)) &&
        (targets.get(String(room._id)) || 0) < Math.max(0, Number(room.capacity) || 0)
      )
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
    preview = false,
    seed = '',
    organization = '',
    department = '',
    departmentIds = [],
    classIds = [],
    roomIds = [],
    roomPlan = [],
    shift = '',
  } = req.body as any;

  const year = norm(academicYear);
  const type = examTypeValue(norm(examType));
  const allocationSeed = norm(seed) || `${year}|${type}|default`;

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
  const normalizedRoomPlan: Array<{
    classId: string;
    roomIds: string[];
    quotas: Array<{ roomId: string; count: number }>;
  }> = Array.isArray(roomPlan)
    ? roomPlan
        .map((item: any) => {
          const quotas = Array.isArray(item?.quotas)
            ? item.quotas
                .map((quota: any) => ({
                  roomId: mongoose.isValidObjectId(String(quota?.roomId || '')) ? String(quota.roomId) : '',
                  count: Number(quota?.count),
                }))
                .filter((quota: { roomId: string; count: number }) =>
                  quota.roomId && Number.isInteger(quota.count) && quota.count > 0
                )
            : [];

          const explicitRoomIds = Array.isArray(item?.roomIds)
            ? item.roomIds
                .filter((id: unknown) => mongoose.isValidObjectId(String(id)))
                .map((id: unknown) => String(id))
            : [];

          const roomIds = Array.from(new Set<string>([
            ...explicitRoomIds,
            ...quotas.map((quota: { roomId: string; count: number }) => quota.roomId),
          ]));

          return {
            classId: mongoose.isValidObjectId(String(item?.classId || '')) ? String(item.classId) : '',
            roomIds,
            quotas,
          };
        })
        .filter((item: { classId: string; roomIds: string[] }) => item.classId && item.roomIds.length > 0)
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
      throw new BadRequestError('One or more selected Rooms are missing or have no capacity');
    }
  } else {
    selectedRooms = await ExamRoom.find({
      school: targetSchoolId,
      capacity: { $gt: 0 },
    }).sort({ building: 1, name: 1 }).lean();
  }

  selectedRooms.forEach(r => assertOwnOrg(req, r, 'school'));
  if (!selectedRooms.length) throw new BadRequestError('Select at least one Room with a valid capacity');

  const targetClassIdSet = new Set(targetClasses.map(c => String(c._id)));
  const selectedRoomIdSet = new Set(selectedRooms.map(room => String(room._id)));
  const roomPlanMap = new Map<string, string[]>();
  for (const item of normalizedRoomPlan) {
    if (!targetClassIdSet.has(item.classId)) {
      throw new BadRequestError('Room Plan contains a class outside the selected active classes');
    }
    const invalidRoom = item.roomIds.find((id: string) => !selectedRoomIdSet.has(id));
    if (invalidRoom) {
      throw new BadRequestError('Room Plan contains a room outside the selected organization rooms');
    }
    roomPlanMap.set(item.classId, item.roomIds);
  }

  if (normalizedRoomPlan.length) {
    const classesWithStudents = new Set(selected.map(s => String(s.class?._id || s.class || '')));
    for (const classId of classesWithStudents) {
      if (classId && !roomPlanMap.has(classId)) {
        const cls = targetClasses.find(c => String(c._id) === classId);
        throw new BadRequestError(`Choose at least one Room for ${norm([cls?.title, cls?.section].filter(Boolean).join(' ')) || 'each selected class'}`);
      }
    }
  }

  const totalCapacity = selectedRooms.reduce((sum, room) => sum + Math.max(0, Number(room.capacity) || 0), 0);
  if (totalCapacity < selected.length) {
    throw new BadRequestError(
      `Insufficient room capacity: ${selected.length} students selected but the chosen rooms hold only ${totalCapacity}. Add another room or increase room capacity.`
    );
  }

  const scope: any = { academicYear: year, examType: type, school: targetSchoolId };
  const selectedIds = selected.map(s => s._id);
  const selectedIdStrings = new Set(selectedIds.map(id => String(id)));
  const existingRows = await ExamSeatingPlan.find({
    ...scope,
    student: { $in: selectedIds },
  }).lean() as any[];

  if (existingRows.length && !overwrite) {
    throw new BadRequestError(
      `Some selected students already have room assignments for ${year} / ${type}. Enable Rebalance existing assignments to preview or replace them.`
    );
  }

  const selectedRoomSet = new Set(selectedRooms.map(room => String(room._id)));
  const lockedRows = existingRows.filter(row => row.locked === true);
  const existingByRoom = new Map<string, any[]>();
  for (const row of existingRows) {
    const roomId = String(row.room);
    const list = existingByRoom.get(roomId) || [];
    list.push(row);
    existingByRoom.set(roomId, list);
  }
  const frozenRoomIds = new Set(
    Array.from(existingByRoom.entries())
      .filter(([, rows]) => rows.length > 0 && rows.every(row => row.locked === true))
      .map(([roomId]) => roomId)
  );
  const invalidLocked = lockedRows.find(row => !selectedRoomSet.has(String(row.room)));
  if (invalidLocked) {
    throw new BadRequestError(
      'A locked student is assigned to a room that is not selected. Include that room or unlock the student before rebalancing.'
    );
  }

  if (roomPlanMap.size) {
    const lockedOutsidePlan = lockedRows.find(row => {
      const student = selected.find(s => String(s._id) === String(row.student));
      if (!student) return false;
      const classId = String(student.class?._id || student.class || '');
      const allowed = roomPlanMap.get(classId) || [];
      return !allowed.includes(String(row.room));
    });
    if (lockedOutsidePlan) {
      throw new BadRequestError(
        'A locked student is in a Room outside the new class Room Plan. Include that Room or unlock the student before rebalancing.'
      );
    }
  }

  const studentById = new Map(selected.map(student => [String(student._id), student]));
  const lockedStudentIds = new Set(lockedRows.map(row => String(row.student)));
  const initialCounts = new Map<string, number>();
  const assignments: Array<{ roomId: any; student: any; locked: boolean; allocationId?: any }> = [];

  for (const row of lockedRows) {
    const student = studentById.get(String(row.student));
    if (!student || !selectedIdStrings.has(String(row.student))) continue;
    const roomId = String(row.room);
    initialCounts.set(roomId, (initialCounts.get(roomId) || 0) + 1);
    assignments.push({
      roomId: row.room,
      student,
      locked: true,
      allocationId: row._id,
    });
  }

  for (const room of selectedRooms) {
    const lockedCount = initialCounts.get(String(room._id)) || 0;
    if (lockedCount > Number(room.capacity || 0)) {
      throw new BadRequestError(`${room.name} has more locked students than its room capacity`);
    }
  }

  const availableStudents = selected.filter(student => !lockedStudentIds.has(String(student._id)));

  if (roomPlanMap.size) {
    const currentCounts = new Map<string, number>(initialCounts);
    const roomById = new Map(selectedRooms.map(room => [String(room._id), room]));
    const studentsByClass = new Map<string, any[]>();

    for (const student of availableStudents) {
      const classId = String(student.class?._id || student.class || '');
      const group = studentsByClass.get(classId) || [];
      group.push(student);
      studentsByClass.set(classId, group);
    }

    const classGroups = Array.from(studentsByClass.entries())
      .map(([classId, group]) => ({
        classId,
        group,
        allowedRoomIds: roomPlanMap.get(classId) || [],
      }))
      .sort((a, b) =>
        a.allowedRoomIds.length - b.allowedRoomIds.length
        || b.group.length - a.group.length
        || a.classId.localeCompare(b.classId)
      );

    for (const classGroup of classGroups) {
      const allowedRooms = classGroup.allowedRoomIds
        .map(id => roomById.get(id))
        .filter(Boolean) as any[];

      if (!allowedRooms.length) {
        throw new BadRequestError('A selected class has no available Rooms in the Room Plan');
      }

      const remainingCapacity = allowedRooms.reduce((sum, room) => {
        const roomId = String(room._id);
        if (frozenRoomIds.has(roomId)) return sum;
        return sum + Math.max(0, Number(room.capacity || 0) - (currentCounts.get(roomId) || 0));
      }, 0);

      if (remainingCapacity < classGroup.group.length) {
        const cls = targetClasses.find(c => String(c._id) === classGroup.classId);
        const label = norm([cls?.title, cls?.section].filter(Boolean).join(' ')) || 'Selected class';
        throw new BadRequestError(
          `${label} needs ${classGroup.group.length} available seats in its planned Rooms, but only ${remainingCapacity} remain. Choose another Room or adjust the plan.`
        );
      }

      const shuffled = shuffle(
        classGroup.group.slice().sort((a, b) =>
          String(a.studentId || a._id).localeCompare(String(b.studentId || b._id), undefined, { numeric: true })
        ),
        mulberry32(hashSeed(`${allocationSeed}|${classGroup.classId}`)),
      );

      for (const student of shuffled) {
        const candidates = allowedRooms
          .filter(room => {
            const id = String(room._id);
            return !frozenRoomIds.has(id) && (currentCounts.get(id) || 0) < Math.max(0, Number(room.capacity) || 0);
          })
          .sort((a, b) => {
            const aId = String(a._id);
            const bId = String(b._id);
            const aCapacity = Math.max(1, Number(a.capacity) || 1);
            const bCapacity = Math.max(1, Number(b.capacity) || 1);
            const aRatio = (currentCounts.get(aId) || 0) / aCapacity;
            const bRatio = (currentCounts.get(bId) || 0) / bCapacity;
            return aRatio - bRatio
              || (currentCounts.get(aId) || 0) - (currentCounts.get(bId) || 0)
              || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
          });

        const room = candidates[0];
        if (!room) {
          throw new BadRequestError('Could not place every student within the selected class Room Plan');
        }

        const roomId = String(room._id);
        currentCounts.set(roomId, (currentCounts.get(roomId) || 0) + 1);
        assignments.push({
          roomId: room._id,
          student,
          locked: false,
        });
      }
    }
  } else {
    const mixed = roundRobinMix(availableStudents, allocationSeed);
    const targets = balancedRoomTargets(selectedRooms, mixed.length, initialCounts, frozenRoomIds);
    let cursor = 0;

    for (const room of selectedRooms) {
      const roomId = String(room._id);
      const lockedCount = initialCounts.get(roomId) || 0;
      const finalTarget = targets.get(roomId) || lockedCount;
      const needed = Math.max(0, finalTarget - lockedCount);
      const group = mixed.slice(cursor, cursor + needed);
      cursor += group.length;

      group.forEach(student => assignments.push({
        roomId: room._id,
        student,
        locked: false,
      }));
    }
  }

  if (assignments.length !== selected.length) {
    throw new BadRequestError('Could not place every selected student into the chosen rooms');
  }

  const breakdown = roomReport(selectedRooms, assignments, selected);
  const issues = [
    ...breakdown
      .filter(room => room.students > room.capacity)
      .map(room => `${room.room} exceeds capacity by ${room.students - room.capacity}`),
  ];

  const responseData = {
    academicYear: year,
    examType: type,
    seed: allocationSeed,
    preview: Boolean(preview),
    students: selected.length,
    assigned: assignments.length,
    remaining: 0,
    rooms: breakdown.length,
    mixedClasses: true,
    roomOnly: true,
    plannedByClass: roomPlanMap.size > 0,
    totalCapacity,
    freeCapacity: Math.max(0, totalCapacity - selected.length),
    lockedStudents: lockedRows.length,
    lockedRooms: frozenRoomIds.size,
    selectedClasses: targetClasses.map(c => ({
      _id: c._id,
      name: norm([c.title, c.section].filter(Boolean).join(' ')),
    })),
    classBreakdown: classCounts(selected),
    roomBreakdown: breakdown,
    issues,
  };

  if (preview) {
    return ApiResponse.success(
      res,
      responseData,
      `Preview ready: ${selected.length} students balanced across ${breakdown.length} rooms`
    );
  }

  if (overwrite) {
    await ExamSeatingPlan.deleteMany({
      ...scope,
      student: { $in: selectedIds },
      locked: { $ne: true },
    });
  }

  const docs: any[] = assignments
    .filter(item => !item.locked)
    .map(item => ({
      student: item.student._id,
      room: item.roomId,
      deskNumber: `__ROOM_ONLY__${String(item.student._id)}`,
      academicYear: year,
      examType: type,
      school: targetSchoolId,
      locked: false,
    }));

  if (docs.length) await ExamSeatingPlan.insertMany(docs);

  return ApiResponse.success(
    res,
    responseData,
    `Assigned ${selected.length} students across ${breakdown.length} balanced mixed-grade rooms`
  );
};
