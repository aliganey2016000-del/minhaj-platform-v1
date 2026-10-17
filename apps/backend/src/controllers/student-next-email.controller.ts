import { Request, Response } from 'express';
import User from '../models/user.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "student732@balcad.com" -> { prefix: "student", digits: "732", domain: "balcad.com" } */
export function parseNumberedEmail(email: string): { prefix: string; digits: string; domain: string } | null {
  const match = String(email || '').trim().toLowerCase().match(/^(.*?)(\d+)@([^@]+)$/);
  return match ? { prefix: match[1], digits: match[2], domain: match[3] } : null;
}

/**
 * Suggests the next student login email by continuing the pattern of the last
 * student registered in the school (student732@balcad.com -> student733@balcad.com).
 * Returns null when the last student's email has no number to continue.
 */
export const getNextStudentEmail = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = resolveOrgIdForCreate(req, req.query.school as string | undefined);
  if (!schoolId) throw new BadRequestError('School is required');

  const last: any = await Student.findOne({ school: schoolId }).sort({ createdAt: -1 }).populate('user', 'email').select('user').lean();
  const pattern = parseNumberedEmail(last?.user?.email || '');
  if (!pattern) return ApiResponse.success(res, { email: null, lastEmail: last?.user?.email || null });

  // The highest number already used with this prefix and domain, not just the last one created.
  const rows: any[] = await User.find({
    role: 'student',
    organizationId: schoolId,
    email: new RegExp(`^${escapeRegex(pattern.prefix)}\\d+@${escapeRegex(pattern.domain)}$`, 'i'),
  }).select('email').limit(50000).lean();
  let highest = Number(pattern.digits);
  for (const row of rows) {
    const parsed = parseNumberedEmail(row.email);
    if (parsed) highest = Math.max(highest, Number(parsed.digits));
  }

  // Keep the same zero padding (student007 -> student008) and skip any address already taken anywhere.
  for (let next = highest + 1; next <= highest + 50; next += 1) {
    const candidate = `${pattern.prefix}${String(next).padStart(pattern.digits.length, '0')}@${pattern.domain}`;
    if (!await User.exists({ email: candidate })) return ApiResponse.success(res, { email: candidate, lastEmail: last.user.email });
  }
  return ApiResponse.success(res, { email: null, lastEmail: last.user.email });
};
