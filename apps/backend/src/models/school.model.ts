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
import { INSTITUTION_TYPES, OWNERSHIP_TYPES, resolveInstitutionType, type InstitutionType, type OwnershipType } from '../utils/academic-config';
import { microCache } from '../utils/micro-cache';

export { resolveInstitutionType };

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
  logoStorageKey?: string;
  themeColor?: string;
}

export interface IExamShiftRule {
  name: string;
  startTime: string;
  endTime: string;
}

export interface IExamSchedulingRules {
  preventClassOverlap: boolean;
  allowSharedRooms: boolean;
  roomCapacityCheck: boolean;
  maxExamsPerClassPerDay: number;
  minimumGapMinutes: number;
  durationValidation: boolean;
  examShiftCount: number;
  examShifts: IExamShiftRule[];
  allowedExamDays: number[];
}

export interface IExamRoomPlanSettings {
  maxClassPortion: number;
  minSplitPortion: number;
  preferredGradesPerRoom: number;
  minimumGradesPerRoom: number;
  maxSameGradeSharePercent: number;
  preferredGradeDistance: number;
  targetRoomOccupancyPercent: number;
  occupancyBalanceTolerance: number;
  smallClassThreshold: number;
  keepSmallClassesTogether: boolean;
  splitBalanceEqual: boolean;
  spreadSameClassAcrossRooms: boolean;
  useMinimumRooms: boolean;
  minimumStudentsPerUsedRoom: number;
  reserveSeatsPerRoom: number;
  studentsPerInvigilator: number;
  maxInvigilatorsPerRoom: number;
  avoidSameClassSectionsTogether: boolean;
  avoidRepeatGradeMix: boolean;
  autoRepairInvalidPlan: boolean;
  priorityMode: 'balanced_security' | 'maximum_mixing' | 'maximum_room_usage';
}

export interface ISchool extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  code?: string;
  facultyName?: string;
  deanName?: string;
  /** Institutional classification: what kind of institution this is. Prefer
   * `resolveInstitutionType(doc)` over reading this field directly anywhere
   * that matters — a document written before this field existed will have
   * it as `undefined` until the org is next saved or the backfill script
   * (src/scripts/backfill-institution-type.ts) runs against it. */
  institutionType?: InstitutionType;
  /** Ownership/category, independent of institutionType (e.g. a university
   * can be public or private) — see academic-config.ts for rationale. */
  ownershipType?: OwnershipType;
  /** @deprecated Superseded by institutionType/ownershipType. Kept only for
   * backward compatibility with documents and test fixtures written before
   * that split; new code should never read this — use resolveInstitutionType(). */
  organizationType?: 'school' | 'university' | 'training_center' | 'private';
  /** Whether this org has completed the required onboarding configuration
   * (institution type + academic structure). Existing orgs predating this
   * field default to `true` (grandfathered as already fully set up) —
   * only newly registered orgs start `false`. Independent of `status`
   * (active/inactive), which is the super-admin enable/disable switch. */
  onboardingCompleted: boolean;
  slug: string;
  subdomain: string;
  /** A fully custom domain (e.g. "yourschool.edu") an org points its own
   * DNS at, resolved before the platform's <slug>.<base domain> routing. */
  customDomain?: string;
  branding: IBranding;
  examSchedulingRules: IExamSchedulingRules;
  examRoomPlanSettings: IExamRoomPlanSettings;
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
  attendanceType: 'course_based' | 'class_based';
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
    logoStorageKey: { type: String, default: '', trim: true, maxlength: 1024 },
    themeColor: {
      type: String,
      default: '#0d9488', // emerald-600
      trim: true,
      match: [/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a valid hex color (e.g. #0d9488)'],
    },
  },
  { _id: false }
);

const examShiftRuleSchema = new Schema<IExamShiftRule>(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    startTime: { type: String, required: true, match: [/^\d{2}:\d{2}$/, 'Shift start time must use HH:MM format'] },
    endTime: { type: String, required: true, match: [/^\d{2}:\d{2}$/, 'Shift end time must use HH:MM format'] },
  },
  { _id: false }
);

const examSchedulingRulesSchema = new Schema<IExamSchedulingRules>(
  {
    preventClassOverlap: { type: Boolean, default: true },
    // Shared rooms are intentionally allowed by default: different grades/classes
    // may sit the same exam session in one hall as long as seating capacity and
    // seat uniqueness remain valid.
    allowSharedRooms: { type: Boolean, default: true },
    roomCapacityCheck: { type: Boolean, default: true },
    maxExamsPerClassPerDay: { type: Number, default: 1, min: 1, max: 10 },
    minimumGapMinutes: { type: Number, default: 30, min: 0, max: 1440 },
    durationValidation: { type: Boolean, default: true },
    examShiftCount: { type: Number, default: 2, min: 1, max: 4 },
    examShifts: {
      type: [examShiftRuleSchema],
      default: () => [
        { name: 'Shift 1', startTime: '08:00', endTime: '10:00' },
        { name: 'Shift 2', startTime: '10:30', endTime: '12:30' },
      ],
    },
    allowedExamDays: {
      type: [Number],
      default: () => [0, 1, 2, 3, 4, 5, 6],
      validate: {
        validator: (days: number[]) =>
          Array.isArray(days) &&
          days.length >= 1 &&
          days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        message: 'At least one valid exam day must be selected',
      },
    },
  },
  { _id: false }
);

const examRoomPlanSettingsSchema = new Schema<IExamRoomPlanSettings>(
  {
    maxClassPortion: { type: Number, default: 50, min: 15, max: 200 },
    minSplitPortion: { type: Number, default: 15, min: 1, max: 100 },
    preferredGradesPerRoom: { type: Number, default: 3, min: 2, max: 3 },
    minimumGradesPerRoom: { type: Number, default: 2, min: 1, max: 3 },
    maxSameGradeSharePercent: { type: Number, default: 45, min: 25, max: 100 },
    preferredGradeDistance: { type: Number, default: 2, min: 0, max: 12 },
    targetRoomOccupancyPercent: { type: Number, default: 90, min: 50, max: 100 },
    occupancyBalanceTolerance: { type: Number, default: 5, min: 0, max: 50 },
    smallClassThreshold: { type: Number, default: 15, min: 1, max: 50 },
    keepSmallClassesTogether: { type: Boolean, default: true },
    splitBalanceEqual: { type: Boolean, default: true },
    spreadSameClassAcrossRooms: { type: Boolean, default: true },
    useMinimumRooms: { type: Boolean, default: true },
    minimumStudentsPerUsedRoom: { type: Number, default: 20, min: 1, max: 100 },
    reserveSeatsPerRoom: { type: Number, default: 2, min: 0, max: 50 },
    studentsPerInvigilator: { type: Number, default: 30, min: 1, max: 100 },
    maxInvigilatorsPerRoom: { type: Number, default: 2, min: 1, max: 10 },
    avoidSameClassSectionsTogether: { type: Boolean, default: true },
    avoidRepeatGradeMix: { type: Boolean, default: true },
    autoRepairInvalidPlan: { type: Boolean, default: true },
    priorityMode: {
      type: String,
      enum: ['balanced_security', 'maximum_mixing', 'maximum_room_usage'],
      default: 'balanced_security',
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
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [50, 'Institution code cannot exceed 50 characters'],
      default: '',
    },
    facultyName: {
      type: String,
      trim: true,
      maxlength: [200, 'Faculty name cannot exceed 200 characters'],
      default: '',
    },
    deanName: {
      type: String,
      trim: true,
      maxlength: [100, 'Dean name cannot exceed 100 characters'],
      default: '',
    },
    institutionType: {
      type: String,
      enum: INSTITUTION_TYPES,
      // No schema-level default — left unset here so the pre-validate hook
      // below can tell "not provided" apart from an explicit value and fall
      // back to the legacy organizationType field first, 'school' only as
      // the last resort (see resolveInstitutionType in academic-config.ts).
    },
    ownershipType: {
      type: String,
      enum: OWNERSHIP_TYPES,
      default: 'private',
    },
    // Deprecated — see the ISchool interface comment above. No longer
    // required so new registrations (which set institutionType instead) can
    // omit it; still accepted so the ~25 existing test fixtures and helper
    // scripts that construct a School with `organizationType` keep working
    // unchanged. The pre-validate hook below backfills institutionType from
    // this field when a document is saved with the old field but not the new.
    organizationType: {
      type: String,
      enum: ['school', 'university', 'training_center', 'private'],
    },
    onboardingCompleted: {
      type: Boolean,
      default: true,
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
      unique: true,
      sparse: true,
      minlength: [3, 'Subdomain must be at least 3 characters'],
      maxlength: [63, 'Subdomain cannot exceed 63 characters'],
      match: [/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Subdomain may only contain lowercase letters, numbers, and hyphens'],
      validate: {
        validator(v: string) { return !v || !RESERVED_SLUGS.has(v); },
        message: 'This subdomain is reserved for system use and cannot be assigned to an organization.',
      },
    },
    customDomain: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // allow many docs with no custom domain set
      maxlength: [255, 'Domain cannot exceed 255 characters'],
      match: [
        /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/,
        'Enter a plain domain name, e.g. "yourschool.edu" (no https:// or trailing slash)',
      ],
      validate: {
        validator(v?: string) {
          if (!v) return true;
          const base = String(process.env.BASE_DOMAIN || 'sahaledu.com')
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/:\d+$/, '')
            .replace(/\/$/, '');
          return v !== base && v !== `www.${base}` && !v.endsWith(`.${base}`);
        },
        message: 'Use the Subdomain field for sahaledu.com addresses; Custom Domain is only for external domains.',
      },
    },
    branding: { type: brandingSchema, default: () => ({}) },
    examSchedulingRules: { type: examSchedulingRulesSchema, default: () => ({}) },
    examRoomPlanSettings: { type: examRoomPlanSettingsSchema, default: () => ({}) },
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
    // Determines how each organization's Attendance list is built:
    // 'course_based' — only students individually enrolled in the course;
    // 'class_based' — every student in the course's Class, auto-included.
    attendanceType: {
      type: String,
      enum: ['course_based', 'class_based'],
      default: 'course_based',
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

// ---------------------------------------------------------------------------
// Pre-Save Hook — Backfill institutionType from the legacy organizationType
// field on any document saved without it explicitly set (old documents being
// touched for an unrelated update, or code/tests still only passing the
// deprecated field). Runs on every save, not just creation, so a document
// that predates this field self-heals the first time it's written again.
// ---------------------------------------------------------------------------

schoolSchema.pre<ISchool>('validate', function (next) {
  if (!this.institutionType) {
    this.institutionType = resolveInstitutionType({ organizationType: this.organizationType });
  }
  next();
});

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
  subdomain?: string;
  customDomain?: string;
  name: string;
  institutionType: string;
  /** @deprecated mirrors institutionType for API back-compat */
  organizationType: string;
  branding: IBranding;
}

interface SchoolModel extends mongoose.Model<ISchool> {
  findByHost(host: string): Promise<TenantBranding | null>;
}

// ---------------------------------------------------------------------------
// Static Helper — resolve tenant from a request Host header.
//
// Tries an exact `customDomain` match first (an org's own domain, e.g.
// "yourschool.edu", pointed straight at the platform) before falling back
// to <slug>.<platform base domain> subdomain routing. Custom domains must be
// checked first: a bare custom domain has only two labels — the same shape
// as the platform's own root domain — so subdomain parsing alone can't tell
// them apart.
// ---------------------------------------------------------------------------

schoolSchema.statics.findByHost = async function (
  host: string
): Promise<TenantBranding | null> {
  // Every request through CORS/tenant-resolution middleware calls this, so
  // it's cached for a short window: a school's domain/subdomain change is
  // reflected within CACHE_TTL_MS instead of on every single request.
  return microCache(`school:findByHost:${host.toLowerCase()}`, CACHE_TTL_MS, () => resolveByHost.call(this, host));
};

const CACHE_TTL_MS = 30_000;

async function resolveByHost(this: mongoose.Model<ISchool>, host: string): Promise<TenantBranding | null> {
  // Strip port if present
  const hostname = host.replace(/:\d+$/, '').toLowerCase();

  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  const byCustomDomain = await this.findOne({
    customDomain: hostname,
    status: 'active',
  })
    .select('slug subdomain customDomain name institutionType organizationType branding')
    .lean();

  if (byCustomDomain) {
    return { ...byCustomDomain, institutionType: resolveInstitutionType(byCustomDomain) } as TenantBranding;
  }

  const configuredBaseDomain = String(process.env.BASE_DOMAIN || 'sahaledu.com')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '');

  const suffix = '.' + configuredBaseDomain;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  const subdomain = hostname.slice(0, -suffix.length);

  if (
    !subdomain ||
    subdomain === 'www' ||
    subdomain.includes('.') ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subdomain)
  ) {
    return null;
  }

  // Resolve managed platform hostnames deterministically:
  // customDomain (above) -> explicit subdomain -> legacy/generated slug.
  // Do not use one $or query here: two different organizations may
  // legitimately have A.subdomain === B.slug, and MongoDB does not define
  // which matching document an unordered findOne($or) should return.
  const bySubdomain = await this.findOne({
    subdomain,
    status: 'active',
  })
    .select('slug subdomain customDomain name institutionType organizationType branding')
    .lean();

  if (bySubdomain) {
    return { ...bySubdomain, institutionType: resolveInstitutionType(bySubdomain) } as TenantBranding;
  }

  const bySlug = await this.findOne({
    slug: subdomain,
    status: 'active',
  })
    .select('slug subdomain customDomain name institutionType organizationType branding')
    .lean();

  if (!bySlug) return null;
  return { ...bySlug, institutionType: resolveInstitutionType(bySlug) } as TenantBranding;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const School = mongoose.model<ISchool, SchoolModel>('School', schoolSchema);
export default School;
