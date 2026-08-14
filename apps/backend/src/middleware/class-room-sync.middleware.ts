import { Request, Response, NextFunction } from 'express';
import ExamRoom from '../models/exam-room.model';
import ClassModel from '../models/class.model';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

const DEFAULT_BUILDING = 'Main Campus';
const FALLBACK_CAPACITY = 30;

/**
 * Keeps the exam-room registry in sync with the existing Class -> Room field.
 * A class does not need a second manual room-creation step. If the named
 * room already exists in the organization we reuse it; otherwise we create
 * an auto-capacity room in Main Campus. The Rooms screen computes the auto
 * capacity from the largest active student count across classes/shifts.
 */
export async function syncClassExamRoom(req: Request, _res: Response, next: NextFunction) {
  try {
    const roomName = String(req.body?.room ?? '').trim();
    if (!roomName) return next();

    let schoolId: any = null;
    if (req.params.id) {
      const existing = await ClassModel.findById(req.params.id).select('school').lean();
      schoolId = existing?.school || null;
    } else {
      schoolId = resolveOrgIdForCreate(req, req.body?.school) || null;
    }

    if (!schoolId) return next();

    const existingRoom = await ExamRoom.findOne({
      school: schoolId,
      name: roomName,
      $or: [{ building: DEFAULT_BUILDING }, { building: '' }, { building: { $exists: false } }],
    });

    if (existingRoom) {
      if (!String(existingRoom.building || '').trim()) {
        existingRoom.building = DEFAULT_BUILDING;
        await existingRoom.save();
      }
      return next();
    }

    await ExamRoom.create({
      name: roomName,
      building: DEFAULT_BUILDING,
      capacity: FALLBACK_CAPACITY,
      capacityMode: 'auto',
      school: schoolId,
      createdBy: req.user!.userId,
    });

    return next();
  } catch (error) {
    return next(error);
  }
}
