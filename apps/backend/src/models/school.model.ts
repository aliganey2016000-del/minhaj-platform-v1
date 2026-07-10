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
  address: string;
  phone: string;
  email: string;
  principalName: string;
  establishedYear: number;
  website?: string;
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
schoolSchema.index({ status: 1 });
schoolSchema.index({ createdBy: 1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const School = mongoose.model<ISchool>('School', schoolSchema);
export default School;