import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { NotFoundError } from '../../utils/api-error';
import { getFromR2, r2Enabled } from '../../utils/r2-storage';

// Public, cache-friendly proxy for Guuldoon figures stored in Cloudflare R2.
// File names are content hashes, so they are unguessable and immutable.
const router = Router();
const FILE_PATTERN = /^[a-f0-9]{32}\.(png|jpe?g|webp|svg)$/;
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

router.get('/:courseId/:file', asyncHandler(async (req, res) => {
  const { courseId, file } = req.params;
  if (!r2Enabled || !mongoose.Types.ObjectId.isValid(courseId) || !FILE_PATTERN.test(file)) throw new NotFoundError('Figure');
  let object;
  try {
    object = await getFromR2(`guuldoon/${courseId}/${file}`);
  } catch {
    throw new NotFoundError('Figure');
  }
  res.set('Content-Type', CONTENT_TYPES[file.split('.').pop() || ''] || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.send(object.body);
}));

export default router;
