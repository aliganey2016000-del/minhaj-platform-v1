/**
 * Student Model
 * Extends User & Profile with student-specific academic data.
 * Tracks enrollment, courses, attendance logs (summary), and academic results (summary).
 */

import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// TypeScript Interface
// ---------------------------------------------------------------------------

export interface IStudent extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  profile: mongoose.Types.ObjectId;
  studentId: string;             // unique e.g. STU-2026-0001
  parent?: mongoose.Types.ObjectId;
  enrollmentDate: Date;
  status: 'active' | 'inactive' | 'graduated' | 'suspended';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  school?: mongoose.Types.ObjectId;
  class?: mongoose.Types.ObjectId;
  grade?: string;
  medicalNotes?: string;
  enrolledCourses: mongoose.Types.ObjectId[];

  // Summary fields for fast dashboard lookups
  attendancePercentage?: number;
  gpa?: number;
    totalFees?: number;          // total amount expected from this student
    totalFeesPaid?: number;      // sum of completed payments
    totalFeesDue?: number;       // remaining = totalFees - totalFeesPaid (computed)
    discount?: number;           // total discount granted

  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const studentSchema = new Schema<IStudent>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      unique: true,
    },
    profile: {
      type: Schema.Types.ObjectId,
      ref: 'Profile',
      required: [true, 'Profile reference is required'],
      unique: true,
    },
    studentId: {
      type: String,
      required: [true, 'Student ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: 'Parent',
      default: null,
      index: true,
    },
    enrollmentDate: {
      type: Date,
      required: [true, 'Enrollment date is required'],
      default: Date.now,
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ['active', 'inactive', 'graduated', 'suspended'],
        message: '{VALUE} is not a valid student status',
      },
      default: 'active',
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
      index: true,
    },
    school: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      default: null,
      index: true,
    },
    class: {
      type: Schema.Types.ObjectId,
      ref: 'Class',
      default: null,
      index: true,
    },
    grade: {
      type: String,
      default: null,
    },
    medicalNotes: {
      type: String,
      default: null,
      maxlength: [500, 'Medical notes cannot exceed 500 characters'],
    },
    enrolledCourses: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Course',
      },
    ],

    // Dashboard summary fields (updated by service layer periodically)
    attendancePercentage: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    gpa: {
      type: Number,
      default: null,
      min: 0,
      max: 4.0,
    },
    totalFees: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalFeesPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalFeesDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
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
// Indexes
// ---------------------------------------------------------------------------

studentSchema.index({ enrollmentDate: -1 });

// Compound index for filtering students by status + enrollment
studentSchema.index({ status: 1, enrollmentDate: -1 });

// ---------------------------------------------------------------------------
// Auto-generate Student ID Pre-save Hook
// ---------------------------------------------------------------------------

studentSchema.pre<IStudent>('validate', async function (next) {
  if (this.isNew && !this.studentId) {
    const currentYear = new Date().getFullYear();
    const count = await mongoose.model('Student').countDocuments();
    const paddedCount = String(count + 1).padStart(4, '0');
    this.studentId = `STU-${currentYear}-${paddedCount}`;
  }
  next();
});

// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------

const Student = mongoose.model<IStudent>('Student', studentSchema);
export default Student;