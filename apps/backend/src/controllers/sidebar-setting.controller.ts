/**
 * Sidebar Setting Controller
 * Tenant-scoped show/hide configuration for portal sidebars.
 *
 *   - portal 'student' and 'teacher': org_admin manages their own org;
 *     platform admin manages any explicitly selected org.
 *   - portal 'admin': platform admin controls the org-admin/staff visibility
 *     layer. Organization staff can only read their own effective setting.
 */

import { Request, Response } from 'express';
import SidebarSetting from '../models/sidebar-setting.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { keysFor, mergeSidebarOverrides, SidebarPortal } from '../utils/sidebar-items';
import { getOwnTeacherRecord } from '../utils/tenant-scope';
import ensureStudentRecord from '../utils/ensure-student';

function parsePortal(value: unknown): SidebarPortal {
  if (value === 'admin' || value === 'teacher' || value === 'student') return value;
  if (value === undefined) return 'student';
  throw new BadRequestError('portal must be "student", "teacher" or "admin"');
}

/**
 * Resolves which organization the caller may read/write settings for, and
 * enforces the per-portal permission rule described above.
 *   - org_admin + portal 'student': always their own org (school id in the
 *     query/body is ignored so they can never widen scope).
 *   - org_admin + portal 'admin': forbidden — read-only via /mine.
 *   - admin: must explicitly pick an org (query ?school= / body.school) for
 *     either portal — there is no "global" sidebar-settings document.
 */
function resolveTargetSchool(req: Request, portal: SidebarPortal, provided?: unknown): string {
  if (req.user?.role === 'org_admin') {
    if (portal === 'admin') {
      throw new ForbiddenError('Only a super admin can configure the admin-portal sidebar.');
    }
    if (!req.user.organizationId) throw new ForbiddenError('Your account is not linked to an organization.');
    return req.user.organizationId;
  }
  // admin
  const schoolId = (provided as string) || undefined;
  if (!schoolId) throw new BadRequestError('school is required — select an organization first.');
  return schoolId;
}

// GET /sidebar-settings?school=<id>&portal=<student|admin>
export const getForOrg = async (req: Request, res: Response): Promise<Response> => {
  const portal = parsePortal(req.query.portal);
  const school = resolveTargetSchool(req, portal, req.query.school);

  const setting = await SidebarSetting.findOne({ school, portal }).lean();
  const items = mergeSidebarOverrides(setting?.items || [], portal);

  return ApiResponse.success(res, { school, portal, items });
};

// PUT /sidebar-settings  { school?, portal?, items: [{ key, visible }] }
export const update = async (req: Request, res: Response): Promise<Response> => {
  const portal = parsePortal(req.body.portal);
  const school = resolveTargetSchool(req, portal, req.body.school);
  const { items } = req.body as { items: { key: string; visible: boolean }[] };

  if (!Array.isArray(items)) throw new BadRequestError('items must be an array');
  const validKeys = keysFor(portal);
  for (const item of items) {
    if (!validKeys.has(item.key)) {
      throw new BadRequestError(`Unknown sidebar item key "${item.key}" for portal "${portal}"`);
    }
    if (typeof item.visible !== 'boolean') {
      throw new BadRequestError(`visible must be a boolean for "${item.key}"`);
    }
  }

  const setting = await SidebarSetting.findOneAndUpdate(
    { school, portal },
    { school, portal, items, updatedBy: req.user!.userId },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  return ApiResponse.success(res, { school, portal, items: mergeSidebarOverrides(setting!.items, portal) }, 'Sidebar settings saved');
};

// GET /sidebar-settings/mine?portal=<student|admin> — effective settings for the caller's own org
export const getMine = async (req: Request, res: Response): Promise<Response> => {
  const portal = parsePortal(req.query.portal);
  const role = req.user?.role;

  let school: unknown;
  if (portal === 'teacher') {
    if (role !== 'teacher') throw new ForbiddenError('Only teachers have a teacher-portal sidebar to read.');
    const teacher = await getOwnTeacherRecord(req);
    school = teacher?.school;
  } else if (portal === 'admin') {
    if (role === 'org_admin' || role === 'staff') {
      school = req.user!.organizationId;
    } else {
      throw new ForbiddenError('Only organization administrators and staff have an admin-portal sidebar to read.');
    }
  } else {
    if (role !== 'student') throw new ForbiddenError('Only students have a student-portal sidebar to read.');
    const student = await ensureStudentRecord(req.user!.userId);
    school = (student as any).school;
  }

  if (!school) throw new NotFoundError('Organization for this account');

  const setting = await SidebarSetting.findOne({ school, portal }).lean();
  const items = mergeSidebarOverrides(setting?.items || [], portal);

  return ApiResponse.success(res, { items });
};
