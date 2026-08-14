import { Request, Response, NextFunction } from 'express';
import ExamRoom from '../models/exam-room.model';
import ClassModel from '../models/class.model';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

/**
 * Keeps the exam-room registry in sync with the existing Class -> Room field.
 * A class does not need a second manual room-creation step. If the named
 * room already exists in the organization we reuse it; otherwise we create
 * it with a safe default capacity. The dedicated Rooms screen can then edit
 * capacity/building without changing the class record.
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

    const requestedCapacity = Number(req.body?.roomCapacity ?? req.body?.capacity);
    const capacity = Number.isFinite(requestedCapacity) && requestedCapacity >= 1 ? requestedCapacity : 30;
    const filter = { school: schoolId, name: roomName };
    const existingRoom = await ExamRoom.findOne(filter);

    if (!existingRoom) {
      await ExamRoom.create({
        name: roomName,
        building: String(req.body?.building ?? '').trim(),
        capacity,
        school: schoolId,
        createdBy: req.user!.userId,
      });
    } else if (req.body?.roomCapacity !== undefined || req.body?.capacity !== undefined) {
      existingRoom.capacity = capacity;
      if (req.body?.building !== undefined) existingRoom.building = String(req.body.building ?? '').trim();
      await existingRoom.save();
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
