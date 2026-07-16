/**
 * School / Tenant Model
 *
 * Represents a registered school / organization (tenant) in the system.
 * Each tenant gets a unique `slug` auto-generated from its name — this
 * slug is used for subdomain routing (e.g. slug.sahaledu.com).
 *
 * Reserved slugs (www, api, admin, app, mail, ftp, sahaledu, static, cdn)
 * are rejected at the model level and also blocked during auto-generation
 * so a tenant can never accidentally claim a system route.
 */

import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// Reserved subdomain slugs — must never be assignable to any organization
// ---------------------------------------------------------------------------

/** Slugs that are reserved for system use and must never be tenant-assignable. */
const RESERVED_SLUGS = new Set([
  'www',
  'api',
  'admin',
  'app',
  'mail',
  'ftp',
  'sahaledu',
  'static',
  'cdn',
]);

/** Generates a short random hex suffix (4 chars) for de-duplication. */
function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 6);
}

/** Converts a name into a candidate slug: lowercase, spaces → hyphens, alphanumeric + hyphens only. */
export function nameToSlugCandidate(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // remove punctuation
    .replace(/\s+/g, '-') // spaces → hyphens
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .slice(0, 30); // max 30 chars
}

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export interface IBranding {
  logo?: string;
  themeColor?: string;
}

export interface ISchool extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  organizationType: 'school' | 'university' | 'training_center' | 'private';
  slug: string;
  subdomain: string;
  branding: IBranding;
  country: string;
  city: string;
  orgId?: string;
  address: string;
  phone: string;
  email: string;
  principalName: string;
  establishedYear: number;
  website?: string;
  estimatedStudents?: '<50' | '50-200' | '200-1000' | '1000+';
  subscriptionPlan: 'free_trial' | 'basic' | 'premium';
  registrationNo?: string;
  status: 'active' | 'inactive';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Branding Sub-Schema
// ---------------------------------------------------------------------------

const brandingSchema = new Schema<IBranding>(
  {
    logo: { type: String, default: '', trim: true, maxlength: 2048 },
    themeColor: {
      type: String,
      default: '#0d9488', // emerald-600
      trim: true,
      match: [/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a valid hex color (e.g. #0d9488)'],
    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// School Schema
// ---------------------------------------------------------------------------

const schoolSchema = new Schema<ISchool>(
  {
    name: {
      type: String,
      required: [true, 'School name is required'],
      trim: true,
      maxlength: [200, 'School name cannot exceed 200 characters'],
    },
    organizationType: {
      type: String,
      required: [true, 'Organization type is required'],
      enum: ['school', 'university', 'training_center', 'private'],
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // allow null during pre-save before slug is generated
      minlength: [3, 'Slug must be at least 3 characters'],
      maxlength: [30, 'Slug cannot exceed 30 characters'],
      match: [/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug may only contain lowercase letters, numbers, and hyphens'],
      validate: {
        validator(v: string) { return !RESERVED_SLUGS.has(v); },
        message: 'This subdomain is reserved for system use and cannot be assigned to an organization.',
      },
    },
    subdomain: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: [3, 'Subdomain must be at least 3 characters'],
      maxlength: [63, 'Subdomain cannot exceed 63 characters'],
      match: [/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Subdomain may only contain lowercase letters, numbers, and hyphens'],
    },
    branding: { type: brandingSchema, default: () => ({}) },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      maxlength: [100, 'Country cannot exceed 100 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters'],
    },
    orgId: {
      type: String,
      default: '',
      trim: true,
      maxlength: [50, 'Organization ID cannot exceed 50 characters'],
      sparse: true,
      index: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: [500, 'Address cannot exceed 500 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      maxlength: [20, 'Phone number cannot exceed 20 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    principalName: {
      type: String,
      required: [true, 'Principal name is required'],
      trim: true,
      maxlength: [100, 'Principal name cannot exceed 100 characters'],
    },
    establishedYear: {
      type: Number,
      required: [true, 'Established year is required'],
      min: [1900, 'Year must be 1900 or later'],
      max: [new Date().getFullYear(), 'Year cannot be in the future'],
    },
    website: {
      type: String,
      default: '',
      trim: true,
    },
    estimatedStudents: {
      type: String,
      enum: ['<50', '50-200', '200-1000', '1000+'],
    },
    subscriptionPlan: {
      type: String,
      enum: ['free_trial', 'basic', 'premium'],
      default: 'free_trial',
    },
    registrationNo: {
      type: String,
      default: '',
      trim: true,
      maxlength: [100, 'Registration number cannot exceed 100 characters'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ---------------------------------------------------------------------------
// Pre-Save Hook — Auto-generate unique slug when not explicitly provided
// ---------------------------------------------------------------------------

schoolSchema.pre<ISchool>('validate', async function (next) {
  // Only generate if slug is missing or was cleared
  if (this.slug && this.slug.length >= 3) return next();

  let base = nameToSlugCandidate(this.name);
  if (base.length < 3) {
    // Fallback — pad with random chars if name is too short after sanitization
    base = base + randomSuffix();
    base = base.slice(0, 30);
  }

  // If the base is a reserved slug, append a random suffix immediately
  if (RESERVED_SLUGS.has(base)) {
    base = `${base}${randomSuffix()}`.slice(0, 30);
  }

  let candidate = base;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const existing = await mongoose.model<ISchool>('School').countDocuments({
      slug: candidate,
      _id: { $ne: this._id },
    });
    if (existing === 0) break;
    candidate = `${base}${randomSuffix()}`.slice(0, 30);
    attempts++;
  }

  if (attempts >= maxAttempts) {
    return next(new Error('Unable to generate a unique slug after 10 attempts. Please choose a different organization name.'));
  }

  this.slug = candidate;
  // Mirror slug to subdomain for backward compatibility if subdomain not explicitly set
  if (!this.subdomain) {
    this.subdomain = candidate;
  }
  next();
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

schoolSchema.index({ name: 1 });
schoolSchema.index({ createdBy: 1 });
// slug unique index is already declared inline via `unique: true` on the field

// ---------------------------------------------------------------------------
// Model Interface (with static methods)
// ---------------------------------------------------------------------------

export interface TenantBranding {
  slug: string;
  name: string;
  organizationType: string;
  branding: IBranding;
}

interface SchoolModel extends mongoose.Model<ISchool> {
  findBySubdomain(host: string): Promise<TenantBranding | null>;
}

// ---------------------------------------------------------------------------
// Static Helper — resolve tenant by slug from Host header subdomain
// ---------------------------------------------------------------------------

schoolSchema.statics.findBySubdomain = async function (
  host: string
): Promise<TenantBranding | null> {
  // Strip port if present
  const hostname = host.replace(/:\d+$/, '');
  const parts = hostname.split('.');

  // localhost or IP → no subdomain tenant
  if (
    parts.length < 2 ||
    hostname === 'localhost' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  ) {
    return null;
  }

  const subdomain = parts[0].toLowerCase();

  // Ignore root / www — those are the main marketing site
  if (subdomain === 'www' || subdomain === parts[parts.length - 1]) {
    return null;
  }

  const school = await this.findOne({
    $or: [{ slug: subdomain }, { subdomain }],
    status: 'active',
  })
    .select('slug name organizationType branding')
    .lean();

  return school as TenantBranding | null;
};

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const School = mongoose.model<ISchool, SchoolModel>('School', schoolSchema);
export default School;
