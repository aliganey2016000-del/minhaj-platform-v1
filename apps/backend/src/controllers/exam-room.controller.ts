/**
 * Exam Room Controller
 * CRUD + Excel import/export for physical exam halls/rooms.
 */

import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import ExamRoom from '../models/exam-room.model';
import ClassModel from '../models/class.model';
import SeatAllocation from '../models/seat-allocation.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate, getOwnTeacherRecord } from '../utils/tenant-scope';
import { assertSafeSpreadsheetUpload } from '../utils/spreadsheet-upload';
import { safeRecord } from '../utils/spreadsheet-safe';

const DEFAULT_BUILDING = 'Main';

const clean = (value: unknown) => String(value ?? '').trim();

async function syncRoomEditsToClassManagement(
  school: unknown,
  previousName: string,
  nextName: string,
  capacity: number,
) {
  if (!school || !previousName) return;

  await ClassModel.updateMany(
    {
      school,
      status: 'active',
      room: previousName,
    },
    {
      $set: {
        room: nextName,
        capacity,
      },
    },
  );
}

async function syncRoomsFromClassManagement(req: Request) {
  const classFilter = applyOrgFilter(req, { status: 'active' }, 'school') as Record<string, unknown>;

  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    classFilter.school = teacher?.school || '__NO_TENANT__';
  }

  const classes = await ClassModel.find(classFilter)
    .select('school room capacity status updatedAt')
    .lean() as any[];

  const grouped = new Map<string, { school: string; name: string; capacity: number }>();

  for (const cls of classes) {
    const school = String(cls.school?._id || cls.school || '');
    const name = clean(cls.room);
    const capacity = Number(cls.capacity);

    // Class Management is the source of truth for this list. A room without a
    // valid capacity cannot be used for exam allocation yet, so do not create
    // a fake capacity for it.
    if (!school || !name || !Number.isFinite(capacity) || capacity < 1) continue;

    const key = `${school}::${name.toLowerCase()}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { school, name, capacity });
    } else {
      // The same physical room may be referenced by more than one active
      // class. Keep one room row and use the largest configured capacity.
      current.capacity = Math.max(current.capacity, capacity);
    }
  }

  const activeRoomIds: string[] = [];

  for (const item of grouped.values()) {
    let room = await ExamRoom.findOne({
      school: item.school,
      name: item.name,
    });

    if (room) {
      // If Capacity was edited from the Rooms tab, keep that manual value and
      // push it back to Class Management. Class Management edits explicitly
      // switch the room back to auto mode (see class.controller.ts), so either
      // screen can be the latest source without GET /exam-rooms undoing it.
      if (room.capacityMode === 'manual') {
        const manualCapacity = Number(room.capacity);
        if (Number.isFinite(manualCapacity) && manualCapacity > 0) {
          await syncRoomEditsToClassManagement(item.school, item.name, item.name, manualCapacity);
        }
        if (!clean(room.building)) {
          await ExamRoom.updateOne({ _id: room._id }, { $set: { building: DEFAULT_BUILDING } });
        }
      } else {
        // Legacy/auto rows continue to follow Class Management.
        await ExamRoom.updateOne(
          { _id: room._id },
          {
            $set: {
              capacity: item.capacity,
              building: clean(room.building) || DEFAULT_BUILDING,
              capacityMode: 'auto',
            },
          }
        );
      }
    } else {
      room = await ExamRoom.create({
        name: item.name,
        building: DEFAULT_BUILDING,
        capacity: item.capacity,
        capacityMode: 'auto',
        allocationEnabled: true,
        school: item.school,
        createdBy: req.user!.userId,
      });
    }

    activeRoomIds.push(String(room._id));
  }

  return activeRoomIds;
}

// GET /exam-rooms
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const scopedFilter = applyOrgFilter(req, {}, 'school');

  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    (scopedFilter as any).school = teacher?.school || '__NO_TENANT__';
  }

  const activeRoomIds = await syncRoomsFromClassManagement(req);

  if (!activeRoomIds.length) {
    return ApiResponse.success(res, []);
  }

  const rooms = await ExamRoom.find({
    ...scopedFilter,
    _id: { $in: activeRoomIds },
  }).sort({ building: 1, name: 1 }).lean();

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
    allocationEnabled: true,
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
  if (req.body?.allocationEnabled !== undefined) {
    if (typeof req.body.allocationEnabled !== 'boolean') {
      throw new BadRequestError('allocationEnabled must be true or false');
    }
    updates.allocationEnabled = req.body.allocationEnabled;
  }

  const duplicate = await ExamRoom.findOne({
    _id: { $ne: existing._id },
    school: existing.school || null,
    name,
    building,
  }).select('_id').lean();
  if (duplicate) throw new BadRequestError(`Room "${name}" already exists in ${building}.`);

  const room = await ExamRoom.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!room) throw new NotFoundError('Exam room');

  // Rooms and Class Management are two editing surfaces for the same physical
  // room capacity. When an admin changes a synced room here, write the change
  // back to every active class using that room so the next automatic room sync
  // does not overwrite the edit with the previous class capacity.
  const syncedCapacity = Number(room.capacity);
  if (Number.isFinite(syncedCapacity) && syncedCapacity > 0) {
    await syncRoomEditsToClassManagement(
      existing.school,
      clean(existing.name),
      clean(room.name),
      syncedCapacity,
    );
  }

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
  const activeRoomIds = await syncRoomsFromClassManagement(req);
  const rooms = activeRoomIds.length
    ? await ExamRoom.find({ ...filter, _id: { $in: activeRoomIds } }).sort({ building: 1, name: 1 }).lean()
    : [];

  const rows = rooms.map((r: any) => ({
    Room: r.name,
    Building: clean(r.building) || DEFAULT_BUILDING,
    Capacity: r.capacity,
    Status: r.allocationEnabled === false ? 'Inactive' : 'Active',
  }));

  const sheet = XLSX.utils.json_to_sheet(rows.map(safeRecord), { header: ['Room', 'Building', 'Capacity', 'Status'] });
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
    const statusRaw = clean(row.Status).toLowerCase();
    const allocationEnabled = statusRaw
      ? !['inactive', 'deactive', 'disabled', 'no', 'false', '0'].includes(statusRaw)
      : true;

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
      existing.allocationEnabled = allocationEnabled;
      await existing.save();
      await syncRoomEditsToClassManagement(school, clean(existing.name), clean(existing.name), capacity);
      updated += 1;
      continue;
    }

    await ExamRoom.create({
      name,
      building,
      capacity,
      capacityMode: 'manual',
      allocationEnabled,
      school,
      createdBy: req.user!.userId,
    });
    created += 1;
  }

  return ApiResponse.success(res, { updated, created, errors }, errors.length ? 'Import completed with validation errors' : 'Rooms imported successfully');
};
