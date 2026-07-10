/**
 * User Model
 * Central authentication collection. All roles (admin, teacher, student, parent)
 * derive from this base document. Stores credentials, verification status,
 * language preference, and hashed refresh tokens for token rotation.
 */
import mongoose, { Document, Model } from 'mongoose';
export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    email: string;
    phone?: string;
    password: string;
    role: 'admin' | 'teacher' | 'student' | 'parent';
    isVerified: boolean;
    isActive: boolean;
    lastLogin?: Date;
    preferredLanguage: 'en' | 'so' | 'ar';
    refreshTokens: string[];
    tokenVersion: number;
    verificationToken?: string;
    verificationTokenExpires?: Date;
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    failedLoginAttempts: number;
    lockedUntil?: Date;
    createdAt: Date;
    updatedAt: Date;
    comparePassword(candidatePassword: string): Promise<boolean>;
    isLocked(): boolean;
}
interface IUserModel extends Model<IUser> {
    hashToken(token: string): string;
}
declare const User: IUserModel;
export default User;
//# sourceMappingURL=user.model.d.ts.map