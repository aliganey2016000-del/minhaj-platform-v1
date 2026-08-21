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
  department?: 'Primary' | 'Middle School' | 'Secondary';
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
    department: { type: String, enum: ['Primary', 'Middle School', 'Secondary'], default: null, index: true },
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
  const student = await mongoose.model<IStudent>('Student').findOne(query).select('class grade enrolledCourses enrollmentHistory status');
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
  const cls: any = await ClassModel.findById(student.class).select('_id title academicYear');
  if (!cls?.academicYear) return;

  const history = student.enrollmentHistory || [];
  const existing = history.find(
    (entry: any) => String(entry.class) === String(cls._id) && entry.academicYear === cls.academicYear && entry.status === 'active',
  );
  if (existing) {
    existing.courses = (student.enrolledCourses || []).map((id) => new mongoose.Types.ObjectId(id));
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
    courses: (student.enrolledCourses || []).map((id) => new mongoose.Types.ObjectId(id)),
    status: 'active',
    startedAt: now,
  });
  student.enrollmentHistory = history;
  await student.save();
});

const Student = mongoose.model<IStudent>('Student', studentSchema);
export default Student;
