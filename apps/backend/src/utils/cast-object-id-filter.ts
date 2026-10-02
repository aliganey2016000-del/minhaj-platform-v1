import mongoose from 'mongoose';

/**
 * Mongoose auto-casts ObjectId-ref string values in `.find()`/`.countDocuments()`
 * queries, but NOT inside `.aggregate()` `$match` stages — a scoped filter
 * built for the former (e.g. an org_admin's `organizationId`, read as a
 * plain string off the JWT) silently matches zero documents when reused
 * as-is in a `$match`. Call this on a scoped filter before using it in an
 * aggregation pipeline, naming which fields are ObjectId refs.
 */
export function castObjectIdFilter<T extends Record<string, unknown>>(filter: T, fields: string[]): T {
  const result: Record<string, unknown> = { ...filter };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
      result[field] = new mongoose.Types.ObjectId(value);
    } else if (value && typeof value === 'object' && Array.isArray((value as { $in?: unknown[] }).$in)) {
      result[field] = {
        $in: (value as { $in: unknown[] }).$in.map((v) =>
          typeof v === 'string' && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : v
        ),
      };
    }
  }
  return result as T;
}
