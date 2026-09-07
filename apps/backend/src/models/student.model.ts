/**
 * Student Model
 * Extends User & Profile with student-specific academic data.
 * Tracks current enrollment, reusable courses, and academic enrollment history.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IStudentEnrollmentHistory {
  academicYear: string;
  class: mongoose.Types.ObjectId;
  grade?: string;
  studyYear?: number;
  semesterNumber?: number;
  semesterInYear?: number;
  courses: mongoose.Types.ObjectId[];
  status: 'active' | 'completed' | 'graduated';
  startedAt: Date;
  endedAt?: Date;
}

export interface IStudent extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  profile: mongoose.Types.ObjectId;
  studentId: string;
  parent?: mongoose.Types.ObjectId;
  enrollmentDate: Date;
  status: 'active' | 'inactive' | 'graduated' | 'suspended';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  school?: mongoose.Types.ObjectId;
  class?: mongoose.Types.ObjectId;
  /** Department name cascaded from the selected Class. Schools may use the
   * legacy grade departments; colleges/universities may use arbitrary names
   * such as Mathematics, Engineering, or Business. */
  department?: string;
  shiftMode?: 'Morning' | 'Afternoon' | 'Evening' | 'Virtual';
  grade?: string;
  medicalNotes?: string;
  enrolledCourses: mongoose.Types.ObjectId[];
  enrollmentHistory: IStudentEnrollmentHistory[];

  attendancePercentage?: number;
  gpa?: number;
  totalFees?: number;
  totalFeesPaid?: number;
  totalFeesDue?: number;
  discount?: number;

  createdAt: Date;
  updatedAt: Date;
}

const enrollmentHistorySchema = new Schema<IStudentEnrollmentHistory>(
  {
    academicYear: { type: String, required: true, trim: true },
    class: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    grade: { type: String, default: null },
    studyYear: { type: Number, default: null, min: 1 },
    semesterNumber: { type: Number, default: null, min: 1 },
    semesterInYear: { type: Number, default: null, min: 1 },
    courses: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    status: { type: String, enum: ['active', 'completed', 'graduated'], required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
  },
  { _id: true }
);

const studentSchema = new Schema<IStudent>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User reference is required'], unique: true },
    profile: { type: Schema.Types.ObjectId, ref: 'Profile', required: [true, 'Profile reference is required'], unique: true },
    studentId: { type: String, required: [true, 'Student ID is required'], trim: true, uppercase: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Parent', default: null, index: true },
    enrollmentDate: { type: Date, required: [true, 'Enrollment date is required'], default: Date.now },
    status: { type: String, required: true, enum: ['active', 'inactive', 'graduated', 'suspended'], default: 'active', index: true },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    class: { type: Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    department: { type: String, trim: true, maxlength: 200, default: null, index: true },
    shiftMode: { type: String, enum: ['Morning', 'Afternoon', 'Evening', 'Virtual'], default: null, index: true },
    grade: { type: String, default: null },
    medicalNotes: { type: String, default: null, maxlength: [500, 'Medical notes cannot exceed 500 characters'] },
    enrolledCourses: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    enrollmentHistory: { type: [enrollmentHistorySchema], default: [] },
    attendancePercentage: { type: Number, default: null, min: 0, max: 100 },
    gpa: { type: Number, default: null, min: 0, max: 4.0 },
    totalFees: { type: Number, default: 0, min: 0 },
    totalFeesPaid: { type: Number, default: 0, min: 0 },
    totalFeesDue: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

studentSchema.index({ enrollmentDate: -1 });
studentSchema.index({ status: 1, enrollmentDate: -1 });
studentSchema.index({ school: 1, department: 1 });
studentSchema.index({ school: 1, shiftMode: 1 });
studentSchema.index({ school: 1, studentId: 1 }, { unique: true });

studentSchema.pre<IStudent>('validate', async function (next) {
  if (this.isNew && !this.studentId) {
    const currentYear = new Date().getFullYear();
    const count = await mongoose.model('Student').countDocuments(this.school ? { school: this.school } : {});
    this.studentId = `STU-${currentYear}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

/**
 * Current course links are derived from the active enrollment record.
 * This prevents stale `enrolledCourses` ids from leaking into the student
 * profile/dashboard after a class or semester transition. The hook only
 * normalizes the returned document; persistence remains the responsibility
 * of enrollment.service.ts, which is the write-side source of truth.
 */
async function normalizeCurrentCourseLinks(student: any): Promise<void> {
  if (!student) return;

  if (student.status !== 'active') {
    student.enrolledCourses = [];
    return;
  }

  const activeHistory = Array.isArray(student.enrollmentHistory)
    ? student.enrollmentHistory
        .filter((entry: any) => entry?.status === 'active')
        .sort((a: any, b: any) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0]
    : undefined;

  // Enrollment history is only trusted as the source of truth once it
  // actually has an active entry. Records created (or bulk-imported) before
  // enrollmentHistory tracking existed — or written by any path that sets
  // enrolledCourses without also pushing a history entry — have no active
  // entry at all. Treating "no active entry" as "zero courses" silently
  // wiped real enrollment data (and persisted the wipe on the next
  // student.save(), e.g. from an unrelated profile edit). Fall back to the
  // raw stored enrolledCourses in that case instead of discarding it.
  const courseIds = activeHistory
    ? (Array.isArray(activeHistory.courses) ? activeHistory.courses : [])
    : (Array.isArray(student.enrolledCourses) ? student.enrolledCourses : []);

  // This hook runs on the result AFTER .populate('enrolledCourses') has
  // already resolved (population happens inside Query#exec, before post
  // hooks fire) — the getMyCourses/getMyDashboard read paths always
  // populate this field. So when falling back to the raw enrolledCourses
  // above, each entry may already be a populated Course document (with
  // title/slug/thumbnail/etc.) rather than a bare ObjectId. Keep each
  // ENTRY as-is (populated doc or raw id) for the final assignment below —
  // only use its id for deduping/existence-checking. Collapsing everything
  // to bare ids here would silently strip the populated fields every real
  // caller needs, even though the ids themselves stay correct.
  const seen = new Set<string>();
  const uniqueEntries = courseIds
    .map((courseId: any) => ({ entry: courseId, id: courseId && courseId._id ? courseId._id : courseId }))
    .filter(({ id }: any) => {
      if (!id) return false;
      const key = String(id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // Enrollment history is the write-side source of truth, but a course may
  // later be deleted/archived while an old ObjectId remains in history.
  // Remove such dangling links before population so profile/dashboard APIs
  // never expose null courses or try to calculate progress for a missing
  // course. This is intentionally read-time cleanup; history is preserved.
  if (uniqueEntries.length > 0) {
    const CourseModel = mongoose.model('Course');
    const existingIds = await CourseModel.find({ _id: { $in: uniqueEntries.map(({ id }: any) => id) } }).distinct('_id');
    const existingSet = new Set(existingIds.map((id: any) => String(id)));
    student.enrolledCourses = uniqueEntries
      .filter(({ id }: any) => existingSet.has(String(id)))
      .map(({ entry }: any) => entry);
  } else {
    student.enrolledCourses = [];
  }
}

// `findOne()` is the common read path behind both the student profile and
// self-service dashboard. Applying the same normalization to lean results
// also covers getById(), which intentionally returns a lean object.
studentSchema.post('findOne', async function (result: any) {
  if (this.getOptions()?.skipCourseNormalization) return;
  await normalizeCurrentCourseLinks(result);
});

/**
 * Central safeguard: bulk promotion currently uses updateOne(), while the
 * enrollment service uses save(). This query hook keeps both paths on the
 * same enrollment-history source of truth without duplicating promotion code.
 */
studentSchema.post('updateOne', async function () {
  const update: any = this.getUpdate() || {};
  const set = update.$set || {};
  const changedClass = set.class !== undefined;
  const graduated = set.status === 'graduated';
  if (!changedClass && !graduated) return;

  const query: any = this.getQuery();
  const student = await mongoose.model<IStudent>('Student')
    .findOne(query)
    .setOptions({ skipCourseNormalization: true })
    .select('class grade enrolledCourses enrollmentHistory');
  if (!student) return;

  if (graduated) {
    let changed = false;
    for (const entry of student.enrollmentHistory || []) {
      if (entry.status === 'active') {
        entry.status = 'graduated';
        entry.endedAt = new Date();
        changed = true;
      }
    }
    if (changed) await student.save();
    return;
  }

  if (!student.class) return;
  const ClassModel = mongoose.model('Class');
  const cls: any = await ClassModel.findById(student.class).select('_id title academicYear studyYear semesterNumber semesterInYear');
  if (!cls?.academicYear) return;

  const history = student.enrollmentHistory || [];
  const existing = history.find(
    (entry: any) => String(entry.class) === String(cls._id)
      && entry.academicYear === cls.academicYear
      && entry.semesterNumber === (cls.semesterNumber ?? null)
      && entry.studyYear === (cls.studyYear ?? null)
      && entry.status === 'active',
  );
  if (existing) {
    existing.courses = (student.enrolledCourses || []).map((id) => new mongoose.Types.ObjectId(id));
    existing.semesterInYear = cls.semesterInYear ?? null;
    await student.save();
    return;
  }

  const now = new Date();
  for (const entry of history) {
    if (entry.status === 'active') {
      entry.status = 'completed';
      entry.endedAt = now;
    }
  }
  history.push({
    academicYear: cls.academicYear,
    class: cls._id,
    grade: cls.title,
    studyYear: cls.studyYear ?? undefined,
    semesterNumber: cls.semesterNumber ?? undefined,
    semesterInYear: cls.semesterInYear ?? undefined,
    courses: (student.enrolledCourses || []).map((id) => new mongoose.Types.ObjectId(id)),
    status: 'active',
    startedAt: now,
  });
  student.enrollmentHistory = history;
  await student.save();
});

const Student = mongoose.model<IStudent>('Student', studentSchema);
export default Student;
