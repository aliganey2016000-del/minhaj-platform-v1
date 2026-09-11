/**
 * Organization Branding Controller
 *
 * Allows an organization admin to manage the logo used by the Admin Portal
 * sidebar. Super admins may manage any organization. Authenticated staff may
 * read their own organization's branding so the sidebar can display it.
 */

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import School from '../models/school.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { cloudinaryEnabled, getCloudinaryPrivateUrl, uploadToCloudinary } from '../utils/cloudinary-storage';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const MAX_LOGO_SIZE = 2 * 1024 * 1024;

function validateLogo(file: Express.Multer.File): void {
  if (!IMAGE_TYPES[file.mimetype]) {
    throw new BadRequestError('Only JPEG, PNG, GIF, and WebP logos are supported.');
  }
  if (file.size > MAX_LOGO_SIZE) {
    throw new BadRequestError('Logo must be 2 MB or smaller.');
  }

  const header = file.buffer.subarray(0, 12);
  const valid = file.mimetype === 'image/jpeg'
    ? header[0] === 0xff && header[1] === 0xd8
    : file.mimetype === 'image/png'
      ? header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.mimetype === 'image/gif'
        ? header.subarray(0, 6).toString() === 'GIF87a' || header.subarray(0, 6).toString() === 'GIF89a'
        : header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WEBP';

  if (!valid) throw new BadRequestError('The uploaded logo content is invalid.');
}

function assertCanViewSchool(req: Request, schoolId: string): void {
  if (req.user?.role === 'admin') return;
  if (!req.user?.organizationId || String(req.user.organizationId) !== schoolId) {
    throw new ForbiddenError('You can only access your organization branding.');
  }
}

function assertCanManageSchool(req: Request, schoolId: string): void {
  if (req.user?.role === 'admin') return;
  if (req.user?.role !== 'org_admin') {
    throw new ForbiddenError('Only organization administrators can manage organization branding.');
  }
  if (!req.user.organizationId || String(req.user.organizationId) !== schoolId) {
    throw new ForbiddenError('You can only manage branding for your own organization.');
  }
}

export async function getBranding(req: Request, res: Response): Promise<Response> {
  const school = await School.findById(req.params.id).select('_id name branding').lean();
  if (!school) throw new NotFoundError('Organization');
  assertCanViewSchool(req, String(school._id));
  return ApiResponse.success(res, { school });
}

export async function uploadLogo(req: Request, res: Response): Promise<Response> {
  const school = await School.findById(req.params.id);
  if (!school) throw new NotFoundError('Organization');
  assertCanManageSchool(req, String(school._id));
  if (!req.file) throw new BadRequestError('Logo file is required.');

  validateLogo(req.file);

  let logoUrl: string;
  if (cloudinaryEnabled) {
    const uploaded = await uploadToCloudinary(req.file.buffer, `organization-branding/${String(school._id)}`, 'image');
    if (!uploaded.publicId) throw new BadRequestError('Logo upload completed without a storage identifier.');
    // Cloudinary stores these assets as authenticated. Generate the signed
    // delivery URL before saving it because authenticated assets require a
    // signature for browser delivery.
    logoUrl = getCloudinaryPrivateUrl(uploaded.publicId, 'image');
  } else {
    const directory = path.join(process.cwd(), 'uploads', 'organization-branding', String(school._id));
    fs.mkdirSync(directory, { recursive: true });
    const filename = `logo-${crypto.randomUUID()}${IMAGE_TYPES[req.file.mimetype]}`;
    fs.writeFileSync(path.join(directory, filename), req.file.buffer);
    const baseUrl = String(process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    logoUrl = `${baseUrl}/uploads/organization-branding/${school._id}/${filename}`;
  }

  school.branding = {
    ...(school.branding || {}),
    logo: logoUrl,
  };
  await school.save();

  return ApiResponse.success(res, {
    branding: school.branding,
    school: { _id: school._id, name: school.name },
  }, 'Organization logo updated successfully.');
}

export async function removeLogo(req: Request, res: Response): Promise<Response> {
  const school = await School.findById(req.params.id);
  if (!school) throw new NotFoundError('Organization');
  assertCanManageSchool(req, String(school._id));

  school.branding = {
    ...(school.branding || {}),
    logo: '',
  };
  await school.save();

  return ApiResponse.success(res, {
    branding: school.branding,
    school: { _id: school._id, name: school.name },
  }, 'Organization logo removed successfully.');
}
