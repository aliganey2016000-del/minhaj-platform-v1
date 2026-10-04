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
    // Same-class overlaps are diagnosed by the school schedule controller as
    // a Class conflict. Do not mask that more useful message merely because
    // the class naturally has the same room as itself.
    const candidateClassId = String(schedule.class?._id || schedule.class || '');
    if (candidateClassId === classId) return false;
    const candidateRoom = String(schedule.room || schedule.class?.room || '').trim();
    return candidateRoom && candidateRoom.localeCompare(room, undefined, { sensitivity: 'accent' }) === 0;
  });
  if (conflict) {
    const label = `${(conflict as any).class?.title || 'another class'}${(conflict as any).class?.section ? ` — ${(conflict as any).class.section}` : ''}`;
    throw new BadRequestError(`Room conflict: ${room} is already used by ${label} from ${(conflict as any).startTime} to ${(conflict as any).endTime}`);
  }

  next();
}

/**
 * Class/teacher/room conflict check for the legacy (non-"school-workflow")
 * ClassSchedule routes — POST /class-schedules and PUT /class-schedules/:id,
 * used by university/college/training-center tenants and super admins.
 *
 * Those routes previously ran no overlap check at all: validateScheduleRoomConflict
 * above is only wired into the simplified /school and /school/:id routes, so a
 * teacher (or room) could be booked into two overlapping classes with zero
 * validation as long as the request went through the legacy endpoints — the
 * Teacher/Class/Room fields and their compound indexes on ClassSchedule exist
 * precisely to support this kind of check, but nothing queried them here.
 */
export async function validateLegacyScheduleConflicts(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const existing = req.params.id ? await ClassSchedule.findById(req.params.id).lean() : null;
  if (req.params.id && !existing) {
    next();
    return;
  }

  const schoolId = String(resolveOrgIdForCreate(req, req.body?.school ?? (existing as any)?.school) || '');
  const classId = String(req.body?.class ?? (existing as any)?.class ?? '');
  const teacherRaw = req.body?.teacher !== undefined ? req.body.teacher : (existing as any)?.teacher;
  const teacherId = teacherRaw ? String(teacherRaw) : '';
  const dayOfWeek = Number(req.body?.dayOfWeek !== undefined ? req.body.dayOfWeek : (existing as any)?.dayOfWeek);
  const startTime = String(req.body?.startTime ?? (existing as any)?.startTime ?? '');
  const endTime = String(req.body?.endTime ?? (existing as any)?.endTime ?? '');
  const isActive = req.body?.isActive !== undefined ? req.body.isActive !== false : (existing ? (existing as any).isActive !== false : true);

  if (!isActive) {
    next();
    return;
  }
  if (!schoolId || !classId || !Number.isInteger(dayOfWeek) || !startTime || !endTime) {
    next();
    return;
  }

  const cls = await ClassModel.findOne({ _id: classId, school: schoolId }).select('room').lean();
  const room = String(req.body?.room ?? (cls as any)?.room ?? '').trim();

  const query: Record<string, unknown> = {
    school: schoolId,
    dayOfWeek,
    isActive: true,
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };
  if (req.params.id) query._id = { $ne: req.params.id };

  const candidates = await ClassSchedule.find(query).populate('class', 'room title section').lean();

  const classConflict = candidates.find((s: any) => String(s.class?._id || s.class || '') === classId);
  if (classConflict) {
    const c = classConflict as any;
    throw new BadRequestError(`Class conflict: ${c.class?.title || 'this class'}${c.class?.section ? ` — ${c.class.section}` : ''} already has a schedule from ${c.startTime} to ${c.endTime}`);
  }

  if (teacherId) {
    const teacherConflict = candidates.find((s: any) => String(s.teacher || '') === teacherId);
    if (teacherConflict) {
      const t = teacherConflict as any;
      throw new BadRequestError(`Teacher conflict: this teacher is already scheduled for ${t.class?.title || 'another class'}${t.class?.section ? ` — ${t.class.section}` : ''} from ${t.startTime} to ${t.endTime}`);
    }
  }

  if (room) {
    const roomConflict = candidates.find((s: any) => {
      const candidateClassId = String(s.class?._id || s.class || '');
      if (candidateClassId === classId) return false;
      const candidateRoom = String(s.room || s.class?.room || '').trim();
      return candidateRoom && candidateRoom.localeCompare(room, undefined, { sensitivity: 'accent' }) === 0;
    });
    if (roomConflict) {
      const r = roomConflict as any;
      throw new BadRequestError(`Room conflict: ${room} is already used by ${r.class?.title || 'another class'}${r.class?.section ? ` — ${r.class.section}` : ''} from ${r.startTime} to ${r.endTime}`);
    }
  }

  next();
}
