/**
 * Upload safety: which files may be stored, where they live on disk, and
 * how /uploads serves them.
 *
 * Files under /uploads are served from the API's own origin, so anything a
 * browser could run there (HTML, SVG, JavaScript) must never be stored, and
 * whatever is served is sent with nosniff, a sandboxing CSP and, unless it
 * is a plain image/PDF/audio/video, as a download.
 */

import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { BadRequestError, NotFoundError } from './api-error';

export const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

/** Document and media types teachers and staff attach to records. */
export const DOCUMENT_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/ogg': ['.ogg'],
  'audio/webm': ['.webm'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
};

/** Types a browser may show inline from /uploads; everything else downloads. */
const INLINE_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico',
  '.mp3', '.m4a', '.wav', '.ogg', '.mp4', '.webm',
]);

/**
 * Throws unless the upload's declared type is allowed AND its file name
 * ends in an extension that type allows. Returns the safe extension.
 */
export function assertAllowedUpload(file: Express.Multer.File, allowed: Record<string, string[]> = DOCUMENT_TYPES): string {
  const extensions = allowed[file.mimetype];
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!extensions || !extensions.includes(ext)) {
    throw new BadRequestError('This file type is not allowed. Upload a PDF, image, Office document, text, audio, video or ZIP file.');
  }
  return ext;
}

/** A storage-safe file name: random prefix plus a cleaned original name. */
export function safeStoredName(originalName: string, uniquePrefix: string): string {
  const cleaned = (originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(-120) || 'file';
  return `${uniquePrefix}-${cleaned}`;
}

/**
 * Resolves a stored `/uploads/...` URL to its file, refusing anything that
 * would land outside the uploads folder (`..`, absolute paths, other hosts).
 */
export function resolveUploadPath(url: string): string {
  const relative = String(url || '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
  if (!relative.startsWith('uploads/')) throw new NotFoundError('File');
  const target = path.resolve(process.cwd(), relative);
  if (!target.startsWith(UPLOADS_ROOT + path.sep)) throw new NotFoundError('File');
  return target;
}

/** Folders whose files are private and only served through checked endpoints. */
export const PRIVATE_UPLOAD_PREFIXES = ['/student-documents/', '/teacher-documents/', '/voice-notes/'];

/** express.static `setHeaders` for /uploads. */
export function setUploadHeaders(res: Response, filePath: string): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (!INLINE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    res.setHeader('Content-Disposition', 'attachment');
  }
}

/** Streams a private stored file with the same protective headers. */
export function sendStoredFile(res: Response, url: string, options: { fileName: string; mimeType?: string; download?: boolean }): void {
  const filePath = resolveUploadPath(url);
  if (!fs.existsSync(filePath)) throw new NotFoundError('File');
  const ext = path.extname(filePath).toLowerCase();
  const inline = !options.download && INLINE_EXTENSIONS.has(ext);
  res.setHeader('Content-Type', options.mimeType || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(options.fileName || 'file')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(filePath).pipe(res);
}
