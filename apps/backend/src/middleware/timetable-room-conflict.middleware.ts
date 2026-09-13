import { NextFunction, Request, Response } from 'express';
import ClassSchedule from '../models/class-schedule.model';
import ClassModel from '../models/class.model';
import { BadRequestError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

export async function validateScheduleRoomConflict(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (req.body?.isActive === false) {
    next();
    return;
  }

  const schoolId = String(resolveOrgIdForCreate(req, req.body?.school) || '');
  const classId = String(req.body?.class || '');
  const dayOfWeek = Number(req.body?.dayOfWeek);
  const startTime = String(req.body?.startTime || '');
  const endTime = String(req.body?.endTime || '');
  if (!schoolId || !classId || !Number.isInteger(dayOfWeek) || !startTime || !endTime) {
    next();
    return;
  }

  const cls = await ClassModel.findOne({ _id: classId, school: schoolId }).select('room').lean();
  if (!cls) {
    next();
    return;
  }
  const room = String(req.body?.room || (cls as any).room || '').trim();
  if (!room) {
    next();
    return;
  }

  const query: Record<string, unknown> = {
    school: schoolId,
    dayOfWeek,
    isActive: true,
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };
  if (req.params.id) query._id = { $ne: req.params.id };

  const candidates = await ClassSchedule.find(query).populate('class', 'room title section').lean();
  const conflict = candidates.find((schedule: any) => {
    const candidateRoom = String(schedule.room || schedule.class?.room || '').trim();
    return candidateRoom && candidateRoom.localeCompare(room, undefined, { sensitivity: 'accent' }) === 0;
  });
  if (conflict) {
    const label = `${(conflict as any).class?.title || 'another class'}${(conflict as any).class?.section ? ` — ${(conflict as any).class.section}` : ''}`;
    throw new BadRequestError(`Room conflict: ${room} is already used by ${label} from ${(conflict as any).startTime} to ${(conflict as any).endTime}`);
  }

  next();
}
