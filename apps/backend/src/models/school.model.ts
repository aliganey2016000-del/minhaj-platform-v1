/**
 * School Model
 *
 * Represents a registered school in the system.
 * Schools are managed by admins and can have students, teachers, and classes
 * associated with them.
 */

import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export interface ISchool extends Document {
  name: string;
  organizationType: 'school' | 'university' | 'training_center' | 'private';
  subdomain: string;
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
// Schema
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
    subdomain: {
      type: String,
      required: [true, 'Subdomain is required'],
      trim: true,
      lowercase: true,
      unique: true,
      minlength: [3, 'Subdomain must be at least 3 characters'],
      maxlength: [63, 'Subdomain cannot exceed 63 characters'],
      match: [/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Subdomain may only contain lowercase letters, numbers, and hyphens'],
    },
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
// Indexes
// ---------------------------------------------------------------------------

schoolSchema.index({ name: 1 });
schoolSchema.index({ createdBy: 1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const School = mongoose.model<ISchool>('School', schoolSchema);
export default School;