import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassModel from '../models/class.model';
import Student from '../models/student.model';
import { BadRequestError } from '../utils/api-error';
import { applyOrgFilter } from '../utils/tenant-scope';

async function blockedClassIds(ids: string[]): Promise<Set<string>> {
  const validIds = ids.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (!validIds.length) return new Set();

  const classes = await ClassModel.find({ _id: { $in: validIds } }).select('_id status').lean();
  const activeIds = classes.filter((cls) => cls.status === 'active').map((cls) => cls._id);
  const protectedIds = classes.filter((cls) => cls.status !== 'active').map((cls) => cls._id);
  const blocked = new Set<string>();

  // An active class may be deleted when it has no CURRENT live student.
  // Historical enrollment references (and graduated students that merely
  // retain the old class id) do not block deletion after an administrator has
  // explicitly changed the class back to Active. This is the requested
  // escape hatch for completed -> Make Active -> Delete.
  if (activeIds.length) {
    const liveCurrentRefs = await Student.distinct('class', {
      class: { $in: activeIds },
      status: { $in: ['active', 'inactive', 'suspended'] },
    });
    liveCurrentRefs.filter(Boolean).forEach((id) => blocked.add(String(id)));
  }

  // Completed/inactive classes remain history-protected until the admin
  // explicitly chooses Make Active. Both current references and historical
  // enrollment records block deletion in those states.
  if (protectedIds.length) {
    const [currentRefs, historyRefs] = await Promise.all([
      Student.distinct('class', { class: { $in: protectedIds } }),
      Student.distinct('enrollmentHistory.class', { 'enrollmentHistory.class': { $in: protectedIds } }),
    ]);
    [...currentRefs, ...historyRefs].filter(Boolean).forEach((id) => blocked.add(String(id)));
  }

  return blocked;
}

function deletionBlockedMessage(count: number): string {
  return `Cannot delete ${count} class${count === 1 ? '' : 'es'} because current student placement or protected enrollment history still references ${count === 1 ? 'it' : 'them'}. Completed/Inactive classes must be made Active first, and Active classes cannot be deleted while live students are currently assigned.`;
}

export async function guardSingleClassDelete(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const id = String(req.params.id || '').trim();
  if (!mongoose.isValidObjectId(id)) {
    next();
    return;
  }
  const refs = await blockedClassIds([id]);
  if (refs.size) throw new BadRequestError(deletionBlockedMessage(refs.size));
  next();
}

export async function guardBulkClassDelete(req: Request, _res: Response, next: NextFunction): Promise<void> {
  let ids: string[] = [];

  if (req.body?.selectAll === true) {
    const filters = (req.body?.filters || {}) as { schoolId?: string; department?: string; status?: string; search?: string };
    const filter: Record<string, unknown> = {};
    if (filters.schoolId && req.user?.role !== 'org_admin') filter.school = filters.schoolId;
    if (filters.department) filter.department = filters.department;
    if (filters.status && ['active', 'inactive', 'completed'].includes(filters.status)) filter.status = filters.status;
    const scopedFilter = applyOrgFilter(req, filter, 'school');

    let candidates: any[] = await ClassModel.find(scopedFilter)
      .select('_id title room section school department')
      .populate('school', 'name')
      .populate('department', 'name')
      .lean();

    if (filters.search) {
      const search = filters.search.toLowerCase();
      candidates = candidates.filter((cls) => {
        const department = (typeof cls.department === 'string' ? cls.department : cls.department?.name || '').toLowerCase();
        return String(cls.title || '').toLowerCase().includes(search)
          || String(cls.room || '').toLowerCase().includes(search)
          || String(cls.section || '').toLowerCase().includes(search)
          || String(cls.school?.name || '').toLowerCase().includes(search)
          || department.includes(search);
      });
    }
    ids = candidates.map((cls) => String(cls._id));
  } else {
    ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  }

  if (!ids.length) {
    next();
    return;
  }

  const refs = await blockedClassIds(ids);
  if (refs.size) throw new BadRequestError(deletionBlockedMessage(refs.size));
  next();
}
