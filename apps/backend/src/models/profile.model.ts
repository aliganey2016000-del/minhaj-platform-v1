/**
 * Profile Model
 * Stores extended personal information for all user types.
 * One-to-one relationship with the User model.
 */

import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// TypeScript Interface
// ---------------------------------------------------------------------------

export interface IAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}

export interface IEmergencyContact {
  name?: string;
  phone?: string;
  relationship?: string;
}

export interface IProfile extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  dateOfBirth?: Date;
  avatar?: string;
  address?: IAddress;
  emergencyContact?: IEmergencyContact;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const profileSchema = new Schema<IProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      unique: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    gender: {
      type: String,
      required: [true, 'Gender is required'],
      enum: {
        values: ['male', 'female'],
        message: '{VALUE} is not a valid gender',
      },
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
      zip: { type: String, default: '' },
    },
    emergencyContact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relationship: { type: String, default: '' },
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

profileSchema.index({ user: 1 }, { unique: true });

// ---------------------------------------------------------------------------
// Virtual — Full Name
// ---------------------------------------------------------------------------

profileSchema.virtual('fullName').get(function (this: IProfile) {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtuals are included in JSON output
profileSchema.set('toJSON', { virtuals: true });
profileSchema.set('toObject', { virtuals: true });

// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------

const Profile = mongoose.model<IProfile>('Profile', profileSchema);
export default Profile;