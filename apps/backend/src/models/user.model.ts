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
  lastSeenAt?: Date;
  preferredLanguage: 'en' | 'so' | 'ar';
  refreshTokens: string[];          // hashed refresh tokens
  tokenVersion: number;             // incremented on password change / logout-all
  verificationToken?: string;
  verificationTokenExpires?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  onboardingCompleted: boolean;     // true once user completes welcome wizard
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
        message: 'Role must be one of: admin, teacher, student, parent, org_admin',
      },
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
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    // Updated on every socket connect/disconnect (see realtime/socket.ts) —
    // "online now" is derived as lastSeenAt within the last presence window,
    // not a separately-maintained boolean that could drift out of sync.
    lastSeenAt: {
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
      select: false,
      default: [],
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
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        delete ret.password;
        delete ret.refreshTokens;
        delete ret.tokenVersion;
        delete ret.verificationToken;
        delete ret.verificationTokenExpires;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.failedLoginAttempts;
        delete ret.lockedUntil;
        return ret;
      },
    },
  }
);

// ---------------------------------------------------------------------------
// Password Hashing Middleware
// ---------------------------------------------------------------------------

userSchema.pre<IUser>('save', async function (next) {
  // Only hash if password was modified (or is new)
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

/** Compare a plain-text password against the stored hash. */
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

/** Check if the account is temporarily locked due to excessive failed logins. */
userSchema.methods.isLocked = function (): boolean {
  if (!this.lockedUntil) return false;
  return new Date() < this.lockedUntil;
};

// ---------------------------------------------------------------------------
// Static Methods
// ---------------------------------------------------------------------------

/** Hash a refresh token for secure storage. */
userSchema.statics.hashToken = function (token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------

const User = mongoose.model<IUser, IUserModel>('User', userSchema);
export default User;