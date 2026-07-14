/**
 * User Model
 * Central authentication collection. All roles (admin, teacher, student, parent)
 * derive from this base document. Stores credentials, verification status,
 * language preference, and hashed refresh tokens for token rotation.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// TypeScript Interface
// ---------------------------------------------------------------------------

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  phone?: string;
  password: string;
  role: 'admin' | 'teacher' | 'student' | 'parent' | 'org_admin';
  organizationId?: mongoose.Types.ObjectId;
  isVerified: boolean;
  isActive: boolean;
  lastLogin?: Date;
  preferredLanguage: 'en' | 'so' | 'ar';
  refreshTokens: string[];          // hashed refresh tokens
  tokenVersion: number;             // incremented on password change / logout-all
  verificationToken?: string;
  verificationTokenExpires?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  isLocked(): boolean;
}

// ---------------------------------------------------------------------------
// Interface for static methods
// ---------------------------------------------------------------------------

interface IUserModel extends Model<IUser> {
  hashToken(token: string): string;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const userSchema = new Schema<IUser, IUserModel>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    phone: {
      type: String,
      unique: true,
      sparse: true, // allows multiple null values for uniqueness
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [1, 'Password is required'],
      select: false, // never returned in queries by default
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ['admin', 'teacher', 'student', 'parent', 'org_admin'],
        message: '{VALUE} is not a valid role',
      },
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      default: null,
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    preferredLanguage: {
      type: String,
      enum: ['en', 'so', 'ar'],
      default: 'en',
    },
    refreshTokens: {
      type: [String],
      default: [],
      select: false,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },
    verificationToken: {
      type: String,
      select: false,
    },
    verificationTokenExpires: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockedUntil: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        ret.password = undefined;
        ret.refreshTokens = undefined;
        ret.tokenVersion = undefined;
        ret.verificationToken = undefined;
        ret.verificationTokenExpires = undefined;
        ret.passwordResetToken = undefined;
        ret.passwordResetExpires = undefined;
        ret.failedLoginAttempts = undefined;
        ret.lockedUntil = undefined;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// (Indexes are declared inline on the schema fields above — email, phone, role, isActive)

// ---------------------------------------------------------------------------
// Pre-save Hook — Hash password & email verification token
// ---------------------------------------------------------------------------

userSchema.pre<IUser>('save', async function (next) {
  // Only hash password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Instance Methods
// ---------------------------------------------------------------------------

/**
 * Compare a candidate password against the stored hash.
 */
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Check if the account is temporarily locked due to too many failed attempts.
 */
userSchema.methods.isLocked = function (): boolean {
  if (!this.lockedUntil) return false;
  // If lock period has passed, unlock automatically
  if (this.lockedUntil < new Date()) {
    this.lockedUntil = undefined;
    this.failedLoginAttempts = 0;
    return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// Static Methods
// ---------------------------------------------------------------------------

/**
 * Hash a token (used for refresh tokens stored in the user document).
 */
userSchema.statics.hashToken = function (token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------

const User = mongoose.model<IUser, IUserModel>('User', userSchema);
export default User;