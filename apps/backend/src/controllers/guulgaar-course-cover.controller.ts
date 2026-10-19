/**
 * Public book-cover assets for Super Admin's Guulgaar global courses.
 * Random immutable filenames; no SVG, remote URLs or user-supplied file paths.
 * Store in Cloudflare R2 when configured, otherwise the shared uploads volume.
 */
import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { UPLOADS_ROOT } from '../utils/upload-safety';
import { getFromR2, r2Enabled, uploadToR2 } from '../utils/r2-storage';

const CONTENT_TYPES: Record<string, { extension: string }> = {
  'image/jpeg': { extension: 'jpg' },
  'image/png': { extension: 'png' },
  'image/webp': { extension: 'webp' },
};
const COVER_FILENAME = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const MAX_BYTES = 3 * 1024 * 1024;
const directory = path.join(UPLOADS_ROOT, 'guulgaar-course-covers');

export function isGuulgaarCoverUrl(value: unknown): value is string {
  return typeof value === 'string'
    && /^\/api\/v1\/courses\/cover\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(value);
}

function isValidImage(file: Express.Multer.File): boolean {
  const header = file.buffer;
  if (file.mimetype === 'image/png') {
    return header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (file.mimetype === 'image/jpeg') {
    return header.length >= 4 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }
  if (file.mimetype === 'image/webp') {
    return header.length >= 12 && header.toString('ascii', 0, 4) === 'RIFF'
      && header.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

export async function uploadCourseCover(req: Request, res: Response): Promise<Response> {
  // Route permissions require the platform Super Admin (role=admin).
  const file = req.file;
  if (!file) throw new BadRequestError('Select a book cover image.');
  const expected = CONTENT_TYPES[file.mimetype];
  if (!expected || file.size > MAX_BYTES || !isValidImage(file)) {
    throw new BadRequestError('Upload a valid JPG, PNG or WebP book cover (up to 3 MB).');
  }
  const filename = `${crypto.randomBytes(16).toString('hex')}.${expected.extension}`;
  if (r2Enabled) {
    await uploadToR2(`guulgaar-course-covers/${filename}`, file.buffer, file.mimetype);
  } else {
    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(path.join(directory, filename), file.buffer, { flag: 'wx' });
  }
  return ApiResponse.success(res, {
    url: `/api/v1/courses/cover/${filename}`,
  }, 'Book cover uploaded.');
}

export async function getCourseCover(req: Request, res: Response): Promise<void> {
  const name = req.params.file;
  if (!COVER_FILENAME.test(name)) throw new NotFoundError('Book cover');
  const ext = path.extname(name);
  const contentType = ext === '.jpg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'image/webp';
  let image: Buffer;
  if (r2Enabled) {
    try { image = (await getFromR2(`guulgaar-course-covers/${name}`)).body; }
    catch { throw new NotFoundError('Book cover'); }
  } else {
    try { image = await fs.promises.readFile(path.join(directory, name)); }
    catch { throw new NotFoundError('Book cover'); }
  }
  res.set('Content-Type', contentType);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.send(image);
}
