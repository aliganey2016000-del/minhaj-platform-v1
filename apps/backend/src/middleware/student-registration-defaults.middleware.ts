import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import User from '../models/user.model';
import Student from '../models/student.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

function slug(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40);
}

function generatedPassword(): string {
  // Random, non-guessable temporary credential. Registration never requires
  // an administrator to invent or reuse a default password.
  return `${crypto.randomBytes(10).toString('hex')}Aa1!`;
}

async function uniqueSystemEmail(prefix: string, kind: 'student' | 'guardian'): Promise<string> {
  const safePrefix = slug(prefix) || kind;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const token = crypto.randomBytes(4).toString('hex');
    const candidate = `${safePrefix}.${token}@${kind}s.sahal.local`;
    if (!await User.exists({ email: candidate })) return candidate;
  }
  throw new BadRequestError(`Could not generate a unique ${kind} email. Please try again.`);
}

function normalizeCommonFields(body: Record<string, any>): void {
  if (body.firstName !== undefined) {
    body.firstName = String(body.firstName || '').trim();
    if (!body.firstName) throw new BadRequestError('First name is required');
  }
  if (body.lastName !== undefined) {
    body.lastName = String(body.lastName || '').trim() || String(body.firstName || '').trim();
  }
  if (body.gender !== undefined) body.gender = String(body.gender || 'male').trim().toLowerCase();
  if (body.email !== undefined) {
    const normalized = String(body.email || '').trim().toLowerCase();
    if (normalized) body.email = normalized;
    else delete body.email;
  }
  if (body.guardianFullName !== undefined) body.guardianFullName = String(body.guardianFullName || '').trim();
  if (body.guardianPhone !== undefined) body.guardianPhone = String(body.guardianPhone || '').trim();
  if (body.guardianEmail !== undefined) {
    const normalized = String(body.guardianEmail || '').trim().toLowerCase();
    if (normalized) body.guardianEmail = normalized;
    else delete body.guardianEmail;
  }
}

/**
 * Normalizes Add Student so the same editable data model can be used by
 * Add/Edit/Import. IDs, organization context, credentials and status remain
 * system-managed. Blank optional fields sent by older frontends are accepted.
 */
export async function prepareStudentCreateDefaults(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const body = (req.body || {}) as Record<string, any>;
  normalizeCommonFields(body);

  if (!body.firstName) throw new BadRequestError('First name is required');
  body.lastName = String(body.lastName || '').trim() || body.firstName;
  body.gender = String(body.gender || 'male').trim().toLowerCase();

  const requestedSchool = body.school || req.query.school;
  const resolvedSchool = resolveOrgIdForCreate(req, requestedSchool);
  if (!body.school && resolvedSchool) body.school = resolvedSchool;

  if (!body.email) body.email = await uniqueSystemEmail(`${body.firstName}.${body.lastName}`, 'student');
  if (!String(body.password || '').trim()) body.password = generatedPassword();

  const guardianName = String(body.guardianFullName || '').trim();
  const guardianPhone = String(body.guardianPhone || '').trim();
  if (guardianName) {
    if (!guardianPhone) throw new BadRequestError('Guardian phone is required');
    if (!body.guardianEmail) body.guardianEmail = await uniqueSystemEmail(`${guardianName}.${guardianPhone.slice(-4)}`, 'guardian');
    if (!String(body.guardianPassword || '').trim()) body.guardianPassword = generatedPassword();
  }

  req.body = body;
  next();
}

/**
 * Edit uses the same optional-email/no-password contract as Add. If an older
 * student has no linked guardian yet, generate the missing guardian login
 * fields only for that first link; never replace an existing guardian's login
 * merely because the admin left optional fields blank.
 */
export async function prepareStudentUpdateDefaults(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const body = (req.body || {}) as Record<string, any>;
  normalizeCommonFields(body);

  if (body.firstName && body.lastName === undefined) {
    // A blank/omitted optional last name follows the same rule as Add.
    body.lastName = body.firstName;
  }

  const guardianName = String(body.guardianFullName || '').trim();
  const guardianPhone = String(body.guardianPhone || '').trim();
  if (guardianName) {
    if (!guardianPhone) throw new BadRequestError('Guardian phone is required');
    const student = await Student.findById(req.params.id).select('parent').lean();
    if (!student) throw new NotFoundError('Student');
    if (!student.parent) {
      if (!body.guardianEmail) body.guardianEmail = await uniqueSystemEmail(`${guardianName}.${guardianPhone.slice(-4)}`, 'guardian');
      if (!String(body.guardianPassword || '').trim()) body.guardianPassword = generatedPassword();
    }
  }

  req.body = body;
  next();
}
