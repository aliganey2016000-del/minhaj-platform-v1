/**
 * Exam Room Controller
 * CRUD + Excel import/export for physical exam halls/rooms.
 */

import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import ExamRoom from '../models/exam-room.model';
import ClassModel from '../models/class.model';
import Student from '../models/student.model';
import SeatAllocation from '../models/seat-allocation.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate, getOwnTeacherRecord } from '../utils/tenant-scope';
import { assertSafeSpreadsheetUpload } from '../utils/spreadsheet-upload';

const DEFAULT_BUILDING = 'Main Campus';
const FALLBACK_CAPACITY = 30;

const clean = (value: unknown) => String(value ?? '').trim();

/**
 * Reconcile the Exam Room registry with Manage Classes.
 *
 * The class record stores the room by name, so existing class assignments
 * must be materialized into ExamRoom even when the assignment predates the
 * Exam Seating Center feature. Room + Building is the identity; therefore a
 * missing class room is created in Main Campus and an existing room is reused.
 */
async function syncRoomsFromClasses(roomFilter: Record<string, unknown> = {}) {
  const school = (roomFilter as any).school;
  const classFilter: Record<string, unknown> = { room: { $nin: ['', null] } };
  if (school) classFilter.school = school;

  const classes = await ClassModel.find(classFilter).select('school room').lean();
  if (!classes.length) return;

  const unique = new Map<string, { school: any; name: string; building: string }>();
  for (const cls of classes as any[]) {
    const name = clean(cls.room);
    if (!name) continue;
    const key = `${cls.school ? String(cls.school) : 'null'}::${name.toLowerCase()}::${DEFAULT_BUILDING.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, { school: cls.school || null, name, building: DEFAULT_BUILDING });
  }

  if (!unique.size) return;

  const existing = await ExamRoom.find({
    $or: Array.from(unique.values()).map((room) => ({
      school: room.school,
      name: room.name,
      building: room.building,
    })),
  }).select('school name building').lean();

  const existingKeys = new Set(existing.map((room: any) =>
    `${room.school ? String(room.school) : 'null'}::${clean(room.name).toLowerCase()}::${clean(room.building || DEFAULT_BUILDING).toLowerCase()}`
  ));

  const missing = Array.from(unique.values()).filter((room) =>
    !existingKeys.has(`${room.school ? String(room.school) : 'null'}::${room.name.toLowerCase()}::${room.building.toLowerCase()}`)
  );

  if (!missing.length) return;

  await ExamRoom.bulkWrite(missing.map((room) => ({
    updateOne: {
      filter: { school: room.school, name: room.name, building: room.building },
      update: {
        $setOnInsert: {
          name: room.name,
          building: room.building,
          capacity: FALLBACK_CAPACITY,
          capacityMode: 'auto',
          school: room.school,
        },
      },
      upsert: true,
    },
  })));
}

/**
 * Auto capacity is the maximum active-student count across the classes/shifts
 * using the same room. Manual capacity edits/imports are never overwritten.
 */
async function syncAutoCapacities(roomFilter: Record<string, unknown> = {}) {
  const rooms = await ExamRoom.find({ ...roomFilter, capacityMode: 'auto' }).select('_id name school capacity').lean();
  if (!rooms.length) return;

  const schoolIds = [...new Set(rooms.map((r: any) => r.school ? String(r.school) : 'null'))];
  const classFilter: Record<string, unknown> = { status: 'active', room: { $nin: ['', null] } };
  const studentFilter: Record<string, unknown> = { status: 'active', approvalStatus: 'approved', class: { $ne: null } };
  if (schoolIds.length === 1 && schoolIds[0] !== 'null') {
    classFilter.school = rooms[0].school;
    studentFilter.school = rooms[0].school;
  } else if (schoolIds.length > 0 && !schoolIds.includes('null')) {
    classFilter.school = { $in: rooms.map((r: any) => r.school).filter(Boolean) };
    studentFilter.school = { $in: rooms.map((r: any) => r.school).filter(Boolean) };
  }

  const [classes, studentCounts] = await Promise.all([
    ClassModel.find(classFilter).select('_id school room').lean(),
    Student.aggregate([
      { $match: studentFilter },
      { $group: { _id: '$class', count: { $sum: 1 } } },
    ]),
  ]);

  const countByClass = new Map(studentCounts.map((x: any) => [String(x._id), Number(x.count)]));
  const maxByRoom = new Map<string, number>();
  for (const cls of classes as any[]) {
    const key = `${cls.school ? String(cls.school) : 'null'}::${clean(cls.room).toLowerCase()}`;
    const count = countByClass.get(String(cls._id)) || 0;
    maxByRoom.set(key, Math.max(maxByRoom.get(key) || 0, count));
  }

  const ops = (rooms as any[])
    .map((room) => {
      const key = `${room.school ? String(room.school) : 'null'}::${clean(room.name).toLowerCase()}`;
      const computed = maxByRoom.get(key) || FALLBACK_CAPACITY;
      if (computed === room.capacity) return null;
      return { updateOne: { filter: { _id: room._id }, update: { $set: { capacity: computed } } } };
    })
    .filter(Boolean) as any[];

  if (ops.length) await ExamRoom.bulkWrite(ops);
}

// GET /exam-rooms
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const scopedFilter = applyOrgFilter(req, {}, 'school');

  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    (scopedFilter as any).school = teacher?.school || null;
  }

  // Important: do this on every Rooms load so rooms already assigned in
  // Manage Classes appear immediately; admins do not need to re-save classes.
  await syncRoomsFromClasses(scopedFilter as Record<string, unknown>);
  await syncAutoCapacities(scopedFilter as Record<string, unknown>);

  const rooms = await ExamRoom.find(scopedFilter).sort({ building: 1, name: 1 }).lean();
  const normalized = rooms.map((room: any) => ({
    ...room,
    building: clean(room.building) || DEFAULT_BUILDING,
  }));
  return ApiResponse.success(res, normalized);
};

// POST /exam-rooms
export const create = async (req: Request, res: Response): Promise<Response> => {
  const name = clean(req.body?.name);
  const building = clean(req.body?.building) || DEFAULT_BUILDING;
  const requestedCapacity = Number(req.body?.capacity);
  const school = resolveOrgIdForCreate(req, req.body?.school) || null;

  if (!name) throw new BadRequestError('name is required');
  if (!Number.isFinite(requestedCapacity) || requestedCapacity < 1) throw new BadRequestError('capacity must be at least 1');

  if (req.user?.role === 'teacher') {
    throw new BadRequestError('Teachers cannot create exam rooms — ask an admin.');
  }

  const duplicate = await ExamRoom.findOne({ school, name, building }).select('_id').lean();
  if (duplicate) throw new BadRequestError(`Room "${name}" already exists in ${building}.`);

  const room = await ExamRoom.create({
    name,
    building,
    capacity: requestedCapacity,
    capacityMode: 'manual',
    school,
    createdBy: req.user!.userId,
  });

  return ApiResponse.created(res, room, 'Exam room created');
};

// PATCH /exam-rooms/:id
export const update = async (req: Request, res: Response): Promise<Response> => {
  const existing = await ExamRoom.findById(req.params.id);
  if (!existing) throw new NotFoundError('Exam room');
  assertOwnsOrg(req, existing, 'school');
  if (req.user?.role === 'teacher') throw new BadRequestError('Teachers cannot edit exam rooms — ask an admin.');

  const updates: Record<string, unknown> = {};
  const name = req.body?.name !== undefined ? clean(req.body.name) : existing.name;
  const building = req.body?.building !== undefined ? (clean(req.body.building) || DEFAULT_BUILDING) : (clean(existing.building) || DEFAULT_BUILDING);

  if (!name) throw new BadRequestError('name is required');
  if (req.body?.capacity !== undefined) {
    const capacity = Number(req.body.capacity);
    if (!Number.isFinite(capacity) || capacity < 1) throw new BadRequestError('capacity must be at least 1');
    updates.capacity = capacity;
    updates.capacityMode = 'manual';
  }
  if (req.body?.name !== undefined) updates.name = name;
  if (req.body?.building !== undefined) updates.building = building;

  const duplicate = await ExamRoom.findOne({
    _id: { $ne: existing._id },
    school: existing.school || null,
    name,
    building,
  }).select('_id').lean();
  if (duplicate) throw new BadRequestError(`Room "${name}" already exists in ${building}.`);

  const room = await ExamRoom.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!room) throw new NotFoundError('Exam room');
  return ApiResponse.success(res, room, 'Exam room updated');
};

// DELETE /exam-rooms/:id
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const existing = await ExamRoom.findById(req.params.id);
  if (!existing) throw new NotFoundError('Exam room');
  assertOwnsOrg(req, existing, 'school');
  if (req.user?.role === 'teacher') throw new BadRequestError('Teachers cannot delete exam rooms — ask an admin.');

  const inUse = await SeatAllocation.exists({ room: existing._id });
  if (inUse) throw new BadRequestError('Cannot delete a room that has active seat allocations.');

  await ExamRoom.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Exam room deleted');
};

// GET /exam-rooms/export
export const exportRooms = async (req: Request, res: Response): Promise<void> => {
  const filter = applyOrgFilter(req, {}, 'school');
  await syncRoomsFromClasses(filter as Record<string, unknown>);
  await syncAutoCapacities(filter as Record<string, unknown>);
  const rooms = await ExamRoom.find(filter).sort({ building: 1, name: 1 }).lean();

  const rows = rooms.map((r: any) => ({
    Room: r.name,
    Building: clean(r.building) || DEFAULT_BUILDING,
    Capacity: r.capacity,
  }));

  const sheet = XLSX.utils.json_to_sheet(rows, { header: ['Room', 'Building', 'Capacity'] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Rooms');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=exam-rooms-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

// POST /exam-rooms/import
export const importRooms = async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role === 'teacher') throw new BadRequestError('Teachers cannot import exam rooms.');
  if (!req.file?.buffer) throw new BadRequestError('Excel file is required');
  assertSafeSpreadsheetUpload(req.file);

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new BadRequestError('Excel workbook has no sheet');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
  if (!rows.length) throw new BadRequestError('Excel sheet is empty');

  const school = resolveOrgIdForCreate(req, req.body?.school) || null;
  const errors: string[] = [];
  let updated = 0;
  let created = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const name = clean(row.Room ?? row['Room Name']);
    const building = clean(row.Building) || DEFAULT_BUILDING;
    const capacity = Number(row.Capacity);

    if (!name) {
      errors.push(`Row ${rowNumber}: Room is required.`);
      continue;
    }
    if (!Number.isFinite(capacity) || capacity < 1) {
      errors.push(`Row ${rowNumber}: Capacity must be a positive number.`);
      continue;
    }

    const existing = await ExamRoom.findOne({ school, name, building });
    if (existing) {
      existing.capacity = capacity;
      existing.capacityMode = 'manual';
      existing.building = building;
      await existing.save();
      updated += 1;
      continue;
    }

    await ExamRoom.create({
      name,
      building,
      capacity,
      capacityMode: 'manual',
      school,
      createdBy: req.user!.userId,
    });
    created += 1;
  }

  return ApiResponse.success(res, { updated, created, errors }, errors.length ? 'Import completed with validation errors' : 'Rooms imported successfully');
};
