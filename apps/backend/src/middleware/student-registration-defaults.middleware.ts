import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import User from '../models/user.model';
import { BadRequestError } from '../utils/api-error';
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
  // Random, non-guessable temporary credential. The UI does not require the
  // admin to type or maintain passwords during registration.
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

/**
 * Normalizes Add Student so the same editable data model can be used by
 * Add/Edit/Import. IDs, organization context, credentials and status remain
 * system-managed. Blank optional fields sent by older frontends are accepted.
 */
export async function prepareStudentCreateDefaults(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const body = req.body || {};
  const firstName = String(body.firstName || '').trim();
  if (!firstName) throw new BadRequestError('First name is required');

  body.firstName = firstName;
  body.lastName = String(body.lastName || '').trim() || firstName;
  body.gender = String(body.gender || 'male').trim().toLowerCase();

  const requestedSchool = body.school || req.query.school;
  const resolvedSchool = resolveOrgIdForCreate(req, requestedSchool);
  if (!body.school && resolvedSchool) body.school = resolvedSchool;

  const suppliedEmail = String(body.email || '').trim().toLowerCase();
  body.email = suppliedEmail || await uniqueSystemEmail(`${body.firstName}.${body.lastName}`, 'student');

  if (!String(body.password || '').trim()) body.password = generatedPassword();

  const guardianName = String(body.guardianFullName || '').trim();
  const guardianPhone = String(body.guardianPhone || '').trim();
  if (guardianName) {
    body.guardianFullName = guardianName;
    if (guardianPhone) body.guardianPhone = guardianPhone;

    const guardianEmail = String(body.guardianEmail || '').trim().toLowerCase();
    if (!guardianEmail && guardianPhone) {
      body.guardianEmail = await uniqueSystemEmail(`${guardianName}.${guardianPhone.slice(-4)}`, 'guardian');
    } else if (guardianEmail) {
      body.guardianEmail = guardianEmail;
    }

    if (guardianPhone && !String(body.guardianPassword || '').trim()) {
      body.guardianPassword = generatedPassword();
    }
  }

  req.body = body;
  next();
}
