/**
 * Tenant Scope Helpers — multi-tenant data isolation for org_admin.
 *
 * Super admin (`admin`) and `teacher` see everything, unscoped. `org_admin`
 * must only ever see/modify records belonging to their own organization
 * (`req.user.organizationId`, embedded in the JWT at login).
 *
 * Usage:
 *   const filter = applyOrgFilter(req, { status: 'active' }, 'school');
 *   const students = await Student.find(filter);
 *
 *   const doc = await Student.findById(id);
 *   assertOwnsOrg(req, doc, 'school'); // throws ForbiddenError if mismatched
 */

import { Request } from 'express';
import { ForbiddenError } from './api-error';

/**
 * Returns a copy of `filter` with the tenant field constrained to the
 * caller's own organization when they are `org_admin`. Admin/teacher get
 * the filter back unchanged (full cross-tenant visibility).
 *
 * Matches the org_admin's own org OR records with no org assigned yet
 * (e.g. a self-registered student pending approval) — those aren't another
 * tenant's data, they're unclaimed, and an org_admin must still be able to
 * see and claim them into their own organization.
 */
export function applyOrgFilter<T extends Record<string, unknown>>(
  req: Request,
  filter: T,
  field = 'school'
): T {
  if (req.user?.role === 'org_admin') {
    if (!req.user.organizationId) {
      // org_admin with no organization bound to their account — show nothing
      // rather than accidentally leaking cross-tenant data.
      return { ...filter, [field]: null } as T;
    }
    return { ...filter, [field]: { $in: [req.user.organizationId, null] } } as T;
  }
  return filter;
}

/**
 * Throws ForbiddenError if the caller is `org_admin` and the given document
 * belongs to a DIFFERENT organization. A document with no org assigned yet
 * is treated as unclaimed, not another tenant's — org_admin may act on it
 * (e.g. approving a pending student into their own org). No-op for
 * admin/teacher, and for a null/undefined document (let the caller's own
 * NotFoundError handle that).
 */
export function assertOwnsOrg(req: Request, doc: any, field = 'school'): void {
  if (!doc) return;
  if (req.user?.role !== 'org_admin') return;

  const docOrgId = doc[field]?._id ? doc[field]._id.toString() : doc[field]?.toString();
  if (!docOrgId) return; // unclaimed — allowed
  if (!req.user.organizationId || docOrgId !== req.user.organizationId) {
    throw new ForbiddenError("You do not have permission to access another organization's data.");
  }
}

/**
 * For create endpoints: returns the organizationId an org_admin's new
 * record must be stamped with, overriding anything the client sent.
 * Returns the client-provided value unchanged for admin/teacher.
 */
export function resolveOrgIdForCreate(req: Request, clientProvidedValue?: unknown): unknown {
  if (req.user?.role === 'org_admin') {
    return req.user.organizationId;
  }
  return clientProvidedValue;
}
