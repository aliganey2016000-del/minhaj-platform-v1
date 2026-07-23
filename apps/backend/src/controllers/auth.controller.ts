/**
 * Auth Controller
 * Handles authentication-related HTTP requests:
 * register, login, logout, refresh-token, verify-email,
 * forgot-password, reset-password, change-password.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import Student from '../models/student.model';
import School from '../models/school.model';
import ClassModel from '../models/class.model';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { logLearningActivity } from '../utils/learning-activity-logger';

function clientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

interface OrganizationPayload {
  organizationId?: string;
  organizationName?: string;
}

async function resolveEffectiveOrganization(user: any): Promise<OrganizationPayload> {
  if (!user) return {};

  if (user.role === 'student') {
    const student = await Student.findOne({ user: user._id }).populate('school', 'name').lean();
    if (student?.school) {
      const school = student.school as any;
      return {
        organizationId: school._id?.toString() || student.school.toString(),
        organizationName: school.name,
      };
    }
  }

  if (user.organizationId) {
    if (typeof user.organizationId === 'object' && user.organizationId !== null) {
      const org = user.organizationId as any;
      return {
        organizationId: org._id?.toString() || org.toString(),
        organizationName: org?.name,
      };
    }

    const org = await School.findById(user.organizationId).select('name').lean();
    return {
      organizationId: user.organizationId.toString(),
      organizationName: org?.name,
    };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export const register = async (req: Request, res: Response): Promise<Response> => {
  const { email, password, firstName, lastName, gender, phone, organizationId, preferredLanguage } = req.body;
  // Public self-registration always creates a 'student' account. Elevated
  // roles (admin, teacher, org_admin, parent) are only ever assigned by an
  // authenticated admin action (see teacher/school/parent controllers) —
  // never take role from client input here.
  const role = 'student';

  // 1. Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ConflictError('A user with this email already exists');
  }

  // 2. Generate verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // 3. Create user
  const user = await User.create({
    email: email.toLowerCase(),
    password,
    role,
    phone: phone || undefined,
    preferredLanguage: preferredLanguage || 'en',
    verificationToken,
    verificationTokenExpires,
  });

  // 4. Create profile
  await Profile.create({
    user: user._id,
    firstName,
    lastName,
    gender,
  });

  // 4b. Create Student document if role is 'student'
  if (role === 'student') {
    const trimmedOrgId = typeof organizationId === 'string' ? organizationId.trim() : '';

    let targetSchool;
    let approvalStatus: 'pending' | 'approved';

    if (trimmedOrgId) {
      // Case A — joining a specific organization by its Organization ID.
      // Requires that org's admin (or super admin) to review before the
      // student gets full access, since they're requesting to join someone
      // else's tenant.
      targetSchool = await School.findOne({ orgId: trimmedOrgId });
      if (!targetSchool) {
        throw new BadRequestError('No organization found with that Organization ID');
      }
      approvalStatus = 'pending';
    } else {
      // Case B — no Organization ID given, fall back to the shared public
      // organization. No admin review needed — auto-approved.
      targetSchool = await School.findOne({ name: 'Public School' });
      if (!targetSchool) {
        targetSchool = await School.create({
          name: 'Public School',
          organizationType: 'private',
          country: 'Somalia',
          city: 'Mogadishu',
          address: 'Online',
          phone: '+000',
          email: 'public@school.edu',
          principalName: 'Admin',
          establishedYear: new Date().getFullYear(),
          createdBy: user._id,
        });
      }
      approvalStatus = 'approved';
    }

    // Auto-find or create that organization's "Public Class" — the default
    // holding class new self-registered students land in.
    let publicClass = await ClassModel.findOne({ school: targetSchool._id, title: 'Public Class' });
    if (!publicClass) {
      publicClass = await ClassModel.create({
        school: targetSchool._id,
        title: 'Public Class',
        section: 'A',
        room: 'Online',
      });
    }

    await Student.create({
      user: user._id,
      profile: (await Profile.findOne({ user: user._id }))!._id,
      enrollmentDate: new Date(),
      approvalStatus,
      school: targetSchool._id,
      class: publicClass._id,
    });

    // Seed welcome notification
    const Notification = mongoose.model('Notification');
    await Notification.create([
      { user: user._id, title: 'Welcome to Masjid Al-Rahma! 🎉', message: 'Your account has been created successfully. Start browsing available courses to enroll.', type: 'success' },
      { user: user._id, title: 'Complete Your Profile', message: 'Add your profile details to get the most out of your learning experience.', type: 'info' },
      { user: user._id, title: 'Browse Available Courses', message: 'Explore our Islamic studies catalog and enroll in courses that interest you.', type: 'info', link: '/student/available' },
    ]);
  }

  // 5. Generate tokens with the resolved tenant/school binding.
  const effectiveOrg = await resolveEffectiveOrganization(user);
  const tokenPair = generateTokenPair(
    {
      userId: user._id.toString(),
      role: user.role,
      permissions: [],
      organizationId: effectiveOrg.organizationId,
    },
    { userId: user._id.toString(), tokenVersion: user.tokenVersion }
  );

  // 6. Store hashed refresh token
  const hashedRefreshToken = User.hashToken(tokenPair.refreshToken);
  user.refreshTokens = [hashedRefreshToken];
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // 7. Set refresh token as httpOnly cookie
  res.cookie('refreshToken', tokenPair.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api',
  });

  // TODO: Send verification email with verificationToken

  return ApiResponse.created(
    res,
    {
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        preferredLanguage: user.preferredLanguage,
        organizationId: effectiveOrg.organizationId,
        organizationName: effectiveOrg.organizationName,
        onboardingCompleted: user.onboardingCompleted,
      },
      accessToken: tokenPair.accessToken,
    },
    'Account created successfully. Please verify your email.'
  );
};

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const login = async (req: Request, res: Response): Promise<Response> => {
  const { email, password, rememberMe } = req.body;

  // 1. Find user (explicitly select password + locked fields)
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+password +refreshTokens +tokenVersion +failedLoginAttempts +lockedUntil');

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // 2. Check if account is locked
  if (user.isLocked()) {
    throw new UnauthorizedError(
      'Account is temporarily locked due to too many failed attempts. Please try again later.'
    );
  }

  // 3. Check if account is active
  if (!user.isActive) {
    throw new UnauthorizedError(
      'Your account has been deactivated. Please contact an administrator.'
    );
  }

  // 4. Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    // Increment failed attempts
    user.failedLoginAttempts += 1;

    // Lock account after 5 consecutive failed attempts
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minute lockout
    }

    await user.save({ validateBeforeSave: false });

    throw new UnauthorizedError('Invalid email or password');
  }

  // 5. Reset failed attempts on successful login
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLogin = new Date();

  const effectiveOrg = await resolveEffectiveOrganization(user);

  // 6. Generate token pair (include resolved tenant binding)
  const tokenPair = generateTokenPair(
    {
      userId: user._id.toString(),
      role: user.role,
      permissions: [], // Will be populated from Role model in production
      organizationId: effectiveOrg.organizationId,
    },
    { userId: user._id.toString(), tokenVersion: user.tokenVersion }
  );

  // 7. Store hashed refresh token
  const hashedRefreshToken = User.hashToken(tokenPair.refreshToken);

  // Keep only the latest 5 refresh tokens per user
  user.refreshTokens.push(hashedRefreshToken);
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }

  await user.save({ validateBeforeSave: false });

  // 8. Set refresh token cookie
  const cookieMaxAge = rememberMe
    ? 30 * 24 * 60 * 60 * 1000  // 30 days if "remember me"
    : 7 * 24 * 60 * 60 * 1000;   // 7 days default

  res.cookie('refreshToken', tokenPair.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: cookieMaxAge,
    path: '/api',
  });

  if (user.role === 'student') {
    const studentRecord = await Student.findOne({ user: user._id }).select('_id school').lean();
    void logLearningActivity({
      userId: user._id,
      student: studentRecord?._id,
      school: studentRecord?.school as any,
      type: 'login',
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
  }

  return ApiResponse.success(
    res,
    {
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        preferredLanguage: user.preferredLanguage,
        organizationId: effectiveOrg.organizationId,
        organizationName: effectiveOrg.organizationName,
        onboardingCompleted: user.onboardingCompleted,
      },
      accessToken: tokenPair.accessToken,
    },
    'Login successful'
  );
};

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export const logout = async (req: Request, res: Response): Promise<Response> => {
  const refreshToken = req.cookies?.refreshToken;

  if (refreshToken) {
    // Hash the token and remove it from the user's stored tokens
    const hashedToken = User.hashToken(refreshToken);

    await User.updateOne(
      { _id: req.user!.userId },
      { $pull: { refreshTokens: hashedToken } }
    );
  }

  // Clear the refresh token cookie
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
  });

  if (req.user?.role === 'student') {
    const studentRecord = await Student.findOne({ user: req.user.userId }).select('_id school').lean();
    void logLearningActivity({
      userId: req.user.userId,
      student: studentRecord?._id,
      school: studentRecord?.school as any,
      type: 'logout',
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
  }

  return ApiResponse.success(res, null, 'Logged out successfully');
};

// ---------------------------------------------------------------------------
// Refresh Token
// ---------------------------------------------------------------------------

export const refreshToken = async (req: Request, res: Response): Promise<Response> => {
  // 1. Get refresh token from cookie
  const oldRefreshToken = req.cookies?.refreshToken;

  if (!oldRefreshToken) {
    throw new UnauthorizedError('Refresh token is missing');
  }

  // 2. Verify the refresh token
  const decoded = verifyRefreshToken(oldRefreshToken);

  // 3. Find user
  const user = await User.findById(decoded.userId)
    .select('+refreshTokens +tokenVersion');

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account is deactivated');
  }

  // 4. Validate token version (invalidates tokens from previous sessions)
  if (decoded.tokenVersion !== user.tokenVersion) {
    // Token version mismatch — possible token theft
    // Clear ALL refresh tokens (force re-login everywhere)
    user.refreshTokens = [];
    user.tokenVersion += 1;
    await user.save({ validateBeforeSave: false });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api',
    });

    throw new UnauthorizedError('Token version mismatch — please login again');
  }

  // 5. Verify the hashed token exists in user's stored tokens
  const hashedOldToken = User.hashToken(oldRefreshToken);
  if (!user.refreshTokens.includes(hashedOldToken)) {
    // Token reuse detected — possible token theft
    user.refreshTokens = [];
    user.tokenVersion += 1;
    await user.save({ validateBeforeSave: false });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api',
    });

    throw new UnauthorizedError('Token reuse detected — all sessions invalidated');
  }

  // 6. Remove old token, generate new pair (token rotation)
  user.refreshTokens = user.refreshTokens.filter(
    (t) => t !== hashedOldToken
  );

  const effectiveOrg = await resolveEffectiveOrganization(user);

  const newTokenPair = generateTokenPair(
    {
      userId: user._id.toString(),
      role: user.role,
      permissions: [],
      organizationId: effectiveOrg.organizationId,
    },
    { userId: user._id.toString(), tokenVersion: user.tokenVersion }
  );

  const hashedNewToken = User.hashToken(newTokenPair.refreshToken);
  user.refreshTokens.push(hashedNewToken);
  await user.save({ validateBeforeSave: false });

  // 7. Set new refresh token cookie
  res.cookie('refreshToken', newTokenPair.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api',
  });

  return ApiResponse.success(
    res,
    { accessToken: newTokenPair.accessToken },
    'Token refreshed successfully'
  );
};

// ---------------------------------------------------------------------------
// Get Current User (Me)
// ---------------------------------------------------------------------------

export const getMe = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findById(req.user!.userId)
    .populate('organizationId', 'name');

  if (!user) {
    throw new NotFoundError('User');
  }

  const profile = await Profile.findOne({ user: user._id });
  const effectiveOrg = await resolveEffectiveOrganization(user);

  const normalizedUser = {
    ...user.toObject(),
    organizationId: effectiveOrg.organizationId,
    organizationName: effectiveOrg.organizationName,
  };

  return ApiResponse.success(res, {
    user: normalizedUser,
    profile,
  });
};

// ---------------------------------------------------------------------------
// Update Preferences (Me)
// ---------------------------------------------------------------------------

export const updatePreferences = async (req: Request, res: Response): Promise<Response> => {
  const { preferredLanguage } = req.body;
  const updates: any = {};
  if (preferredLanguage) updates.preferredLanguage = preferredLanguage;

  const user = await User.findByIdAndUpdate(req.user!.userId, updates, { new: true });
  if (!user) throw new NotFoundError('User');

  return ApiResponse.success(res, { user }, 'Preferences updated');
};

// ---------------------------------------------------------------------------
// Forgot Password
// ---------------------------------------------------------------------------

export const forgotPassword = async (req: Request, res: Response): Promise<Response> => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Return success even if user not found (prevent email enumeration)
    return ApiResponse.success(
      res,
      null,
      'If an account with that email exists, a password reset link has been sent.'
    );
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await user.save({ validateBeforeSave: false });

  // TODO: Send password reset email with resetToken

  return ApiResponse.success(
    res,
    null,
    'If an account with that email exists, a password reset link has been sent.'
  );
};

// ---------------------------------------------------------------------------
// Reset Password
// ---------------------------------------------------------------------------

export const resetPassword = async (req: Request, res: Response): Promise<Response> => {
  const { token } = req.params;
  const { password } = req.body;

  // Hash the token from the URL
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires +tokenVersion +refreshTokens');

  if (!user) {
    throw new BadRequestError('Password reset token is invalid or has expired');
  }

  // Update password and invalidate all existing sessions
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.tokenVersion += 1;            // invalidates all refresh tokens
  user.refreshTokens = [];           // clear all stored refresh tokens
  await user.save();

  return ApiResponse.success(
    res,
    null,
    'Password has been reset successfully. Please login with your new password.'
  );
};

// ---------------------------------------------------------------------------
// Verify Email
// ---------------------------------------------------------------------------

export const verifyEmail = async (req: Request, res: Response): Promise<Response> => {
  const { token } = req.params;

  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpires: { $gt: new Date() },
  }).select('+verificationToken +verificationTokenExpires');

  if (!user) {
    throw new BadRequestError('Verification token is invalid or has expired');
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return ApiResponse.success(res, null, 'Email verified successfully');
};

// ---------------------------------------------------------------------------
// Change Password (authenticated)
// ---------------------------------------------------------------------------

export const changePassword = async (req: Request, res: Response): Promise<Response> => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user!.userId).select('+password +tokenVersion +refreshTokens');

  if (!user) {
    throw new NotFoundError('User');
  }

  // Verify current password
  const isValid = await user.comparePassword(currentPassword);
  if (!isValid) {
    throw new BadRequestError('Current password is incorrect');
  }

  // Update password and invalidate all other sessions
  user.password = newPassword;
  user.tokenVersion += 1;
  user.refreshTokens = []; // keep current refresh token? No, invalidate all for security
  await user.save();

  // Clear refresh token cookie (force re-login)
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
  });

  return ApiResponse.success(
    res,
    null,
    'Password changed successfully. Please login again.'
  );
};

// ---------------------------------------------------------------------------
// Complete Onboarding
// ---------------------------------------------------------------------------

export const completeOnboarding = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findByIdAndUpdate(
    req.user!.userId,
    { onboardingCompleted: true },
    { new: true },
  );

  if (!user) {
    throw new NotFoundError('User');
  }

  return ApiResponse.success(res, {
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      preferredLanguage: user.preferredLanguage,
      organizationId: user.organizationId,
      onboardingCompleted: user.onboardingCompleted,
    },
  }, 'Onboarding wizard completed');
};
