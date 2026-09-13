import { Request, Response } from 'express';
import ClassModel from '../models/class.model';
import Department from '../models/department.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter, getOwnTeacherRecord } from '../utils/tenant-scope';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Paginated class list with server-side search.
 *
 * Search must be applied before skip/limit. The previous implementation
 * populated one page first and then filtered that page in memory, which made
 * valid matches on later pages invisible and returned an incorrect pagination
 * total while searching.
 */
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId, department, status, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (schoolId && req.user?.role !== 'org_admin') filter.school = schoolId as string;

  if (department) {
    const deptIds = String(department).split(',').map((value) => value.trim()).filter(Boolean);
    if (deptIds.length === 1) filter.department = deptIds[0];
    else if (deptIds.length > 1) filter.department = { $in: deptIds };
  }

  if (status && ['active', 'inactive', 'completed'].includes(status as string)) {
    filter.status = status;
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    scopedFilter.school = teacher?.school || null;
  }

  const searchTerm = typeof search === 'string' ? search.trim() : '';
  if (searchTerm) {
    const regex = new RegExp(escapeRegExp(searchTerm), 'i');
    const schoolScope = scopedFilter.school;

    // Resolve referenced names before pagination, but keep those auxiliary
    // lookups inside the same tenant scope as the class query whenever the
    // caller is organization-scoped. Platform-wide admins remain global.
    const schoolSearchFilter: Record<string, unknown> = { name: regex };
    const departmentSearchFilter: Record<string, unknown> = { name: regex };
    if (schoolScope) {
      schoolSearchFilter._id = schoolScope;
      departmentSearchFilter.tenantId = schoolScope;
    }

    const [schools, departments] = await Promise.all([
      School.find(schoolSearchFilter).select('_id').lean(),
      Department.find(departmentSearchFilter).select('_id').lean(),
    ]);

    scopedFilter.$or = [
      { title: regex },
      { room: regex },
      { section: regex },
      { school: { $in: schools.map((item: any) => item._id) } },
      { department: { $in: departments.map((item: any) => item._id) } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));

  const [classes, total] = await Promise.all([
    ClassModel.find(scopedFilter)
      .populate('school', 'name')
      .populate('course', 'title.en slug category')
      .populate('teacher', 'teacherId')
      .populate('department', 'name code')
      .populate('program', 'name code')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    ClassModel.countDocuments(scopedFilter),
  ]);

  const normalizedClasses = (classes as any[]).map((item: any) => ({
    ...item,
    department: typeof item.department === 'string' ? item.department : item.department?.name || '',
    departmentId: typeof item.department === 'object' && item.department?._id ? item.department._id.toString() : undefined,
    program: typeof item.program === 'string' ? item.program : item.program?.name || '',
    programId: typeof item.program === 'object' && item.program?._id ? item.program._id.toString() : undefined,
  }));

  return ApiResponse.paginated(res, normalizedClasses, {
    page: pageNum,
    limit: limitNum,
    total,
  });
};
