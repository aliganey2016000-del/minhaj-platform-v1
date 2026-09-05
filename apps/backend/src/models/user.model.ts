/**
 * User Model
 * Central authentication collection. All roles derive from this base document.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { STAFF_MODULES, STAFF_ACTIONS, StaffPermission } from '../utils/staff-permissions';

export type UserRole =
  | 'admin'
  | 'teacher'
  | 'student'
  | 'parent'
  | 'org_admin'
  | 'finance_manager'
  | 'cashier'
  | 'auditor'
  | 'staff';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  phone?: string;
  password: string;
  role: UserRole;
  permissions: StaffPermission[];
  sidebarAccess: string[];
  department?: mongoose.Types.ObjectId;
  title?: string;
  organizationId?: mongoose.Types.ObjectId;
  isVerified: boolean;
  isActive: boolean;
  lastLogin?: Date;
  lastSeenAt?: Date;
  preferredLanguage: 'en' | 'so' | 'ar';
  refreshTokens: string[];
  tokenVersion: number;
  verificationToken?: string;
  verificationTokenExpires?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  isLocked(): boolean;
}

interface IUserModel extends Model<IUser> {
  hashToken(token: string): string;
}

const userSchema = new Schema<IUser, IUserModel>(
  {
    email: { type: String, required: [true, 'Email is required'], unique: true, sparse: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'] },
    phone: { type: String, unique: true, sparse: true, trim: true },
    password: { type: String, required: [true, 'Password is required'], minlength: [1, 'Password is required'], select: false },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ['admin', 'teacher', 'student', 'parent', 'org_admin', 'finance_manager', 'cashier', 'auditor', 'staff'],
        message: 'Invalid user role',
      },
    },
    permissions: {
      type: [{
        module: { type: String, enum: STAFF_MODULES },
        page: { type: String, trim: true },
        actions: [{ type: String, enum: STAFF_ACTIONS }],
      }],
      default: [],
    },
    sidebarAccess: { type: [String], default: [] },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    title: { type: String, trim: true, maxlength: [100, 'Title cannot exceed 100 characters'], default: '' },
    organizationId: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    preferredLanguage: { type: String, enum: ['en', 'so', 'ar'], default: 'en' },
    refreshTokens: { type: [String], select: false, default: [] },
    tokenVersion: { type: Number, default: 0, select: false },
    verificationToken: { type: String, select: false },
    verificationTokenExpires: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    onboardingCompleted: { type: Boolean, default: false },
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

userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function (): boolean {
  if (!this.lockedUntil) return false;
  return new Date() < this.lockedUntil;
};

userSchema.statics.hashToken = function (token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
};

userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

const User = mongoose.model<IUser, IUserModel>('User', userSchema);
export default User;
