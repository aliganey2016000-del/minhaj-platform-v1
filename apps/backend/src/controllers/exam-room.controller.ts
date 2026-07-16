/**
 * Exam Room Controller
 * CRUD for physical exam halls/rooms, used by Room Allocation.
 */

import { Request, Response } from 'express';
import ExamRoom from '../models/exam-room.model';
import SeatAllocation from '../models/seat-allocation.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate, getOwnTeacherRecord } from '../utils/tenant-scope';

// GET /exam-rooms
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const scopedFilter = applyOrgFilter(req, {}, 'school');

  // Teacher: confined to their own school's rooms (rooms aren't per-course,
  // so this is org-scoped rather than assigned-course-scoped).
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    (scopedFilter as any).school = teacher?.school || null;
  }

  const rooms = await ExamRoom.find(scopedFilter).sort({ name: 1 }).lean();
  return ApiResponse.success(res, rooms);
};

// POST /exam-rooms
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { name, building, capacity, school } = req.body;
  if (!name) throw new BadRequestError('name is required');
  if (!capacity || Number(capacity) < 1) throw new BadRequestError('capacity must be at least 1');

  if (req.user?.role === 'teacher') {
    throw new BadRequestError('Teachers cannot create exam rooms — ask an admin.');
  }

  const room = await ExamRoom.create({
    name,
    building: building || '',
    capacity: Number(capacity),
    school: resolveOrgIdForCreate(req, school) || null,
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

  const { name, building, capacity } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (building !== undefined) updates.building = building;
  if (capacity !== undefined) {
    if (Number(capacity) < 1) throw new BadRequestError('capacity must be at least 1');
    updates.capacity = Number(capacity);
  }

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
