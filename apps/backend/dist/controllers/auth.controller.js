"use strict";
/**
 * Auth Controller
 * Handles authentication-related HTTP requests:
 * register, login, logout, refresh-token, verify-email,
 * forgot-password, reset-password, change-password.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.verifyEmail = exports.resetPassword = exports.forgotPassword = exports.updatePreferences = exports.getMe = exports.refreshToken = exports.logout = exports.login = exports.register = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const user_model_1 = __importDefault(require("../models/user.model"));
const profile_model_1 = __importDefault(require("../models/profile.model"));
const student_model_1 = __importDefault(require("../models/student.model"));
const school_model_1 = __importDefault(require("../models/school.model"));
const class_model_1 = __importDefault(require("../models/class.model"));
const jwt_1 = require("../utils/jwt");
const api_error_1 = require("../utils/api-error");
const api_response_1 = __importDefault(require("../utils/api-response"));
// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------
const register = async (req, res) => {
    const { email, password, firstName, lastName, gender, phone, role, preferredLanguage } = req.body;
    // 1. Check if user already exists
    const existingUser = await user_model_1.default.findOne({ email: email.toLowerCase() });
    if (existingUser) {
        throw new api_error_1.ConflictError('A user with this email already exists');
    }
    // 2. Generate verification token
    const verificationToken = crypto_1.default.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    // 3. Create user
    const user = await user_model_1.default.create({
        email: email.toLowerCase(),
        password,
        role,
        phone: phone || undefined,
        preferredLanguage: preferredLanguage || 'en',
        verificationToken,
        verificationTokenExpires,
    });
    // 4. Create profile
    await profile_model_1.default.create({
        user: user._id,
        firstName,
        lastName,
        gender,
    });
    // 4b. Create Student document if role is 'student'
    if (role === 'student') {
        // Auto-find or create "Public School" and "Public Class" for self-registered students
        let publicSchool = await school_model_1.default.findOne({ name: 'Public School' });
        if (!publicSchool) {
            publicSchool = await school_model_1.default.create({
                name: 'Public School',
                address: 'Online',
                phone: '+000',
                email: 'public@school.edu',
                principalName: 'Admin',
                establishedYear: new Date().getFullYear(),
                createdBy: user._id,
            });
        }
        let publicClass = await class_model_1.default.findOne({ school: publicSchool._id, title: 'Public Class' });
        if (!publicClass) {
            publicClass = await class_model_1.default.create({
                school: publicSchool._id,
                title: 'Public Class',
                section: 'A',
                room: 'Online',
            });
        }
        await student_model_1.default.create({
            user: user._id,
            profile: (await profile_model_1.default.findOne({ user: user._id }))._id,
            enrollmentDate: new Date(),
            approvalStatus: 'pending',
            school: publicSchool._id,
            class: publicClass._id,
        });
        // Seed welcome notification
        const Notification = mongoose_1.default.model('Notification');
        await Notification.create([
            { user: user._id, title: 'Welcome to Masjid Al-Rahma! 🎉', message: 'Your account has been created successfully. Start browsing available courses to enroll.', type: 'success' },
            { user: user._id, title: 'Complete Your Profile', message: 'Add your profile details to get the most out of your learning experience.', type: 'info' },
            { user: user._id, title: 'Browse Available Courses', message: 'Explore our Islamic studies catalog and enroll in courses that interest you.', type: 'info', link: '/student/available' },
        ]);
    }
    // 5. Generate tokens
    const tokenPair = (0, jwt_1.generateTokenPair)({ userId: user._id.toString(), role: user.role, permissions: [] }, { userId: user._id.toString(), tokenVersion: user.tokenVersion });
    // 6. Store hashed refresh token
    const hashedRefreshToken = user_model_1.default.hashToken(tokenPair.refreshToken);
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
    return api_response_1.default.created(res, {
        user: {
            id: user._id,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            preferredLanguage: user.preferredLanguage,
        },
        accessToken: tokenPair.accessToken,
    }, 'Account created successfully. Please verify your email.');
};
exports.register = register;
// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
const login = async (req, res) => {
    const { email, password, rememberMe } = req.body;
    // 1. Find user (explicitly select password + locked fields)
    const user = await user_model_1.default.findOne({ email: email.toLowerCase() })
        .select('+password +refreshTokens +tokenVersion +failedLoginAttempts +lockedUntil');
    if (!user) {
        throw new api_error_1.UnauthorizedError('Invalid email or password');
    }
    // 2. Check if account is locked
    if (user.isLocked()) {
        throw new api_error_1.UnauthorizedError('Account is temporarily locked due to too many failed attempts. Please try again later.');
    }
    // 3. Check if account is active
    if (!user.isActive) {
        throw new api_error_1.UnauthorizedError('Your account has been deactivated. Please contact an administrator.');
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
        throw new api_error_1.UnauthorizedError('Invalid email or password');
    }
    // 5. Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLogin = new Date();
    // 6. Generate token pair
    const tokenPair = (0, jwt_1.generateTokenPair)({
        userId: user._id.toString(),
        role: user.role,
        permissions: [], // Will be populated from Role model in production
    }, { userId: user._id.toString(), tokenVersion: user.tokenVersion });
    // 7. Store hashed refresh token
    const hashedRefreshToken = user_model_1.default.hashToken(tokenPair.refreshToken);
    // Keep only the latest 5 refresh tokens per user
    user.refreshTokens.push(hashedRefreshToken);
    if (user.refreshTokens.length > 5) {
        user.refreshTokens = user.refreshTokens.slice(-5);
    }
    await user.save({ validateBeforeSave: false });
    // 8. Set refresh token cookie
    const cookieMaxAge = rememberMe
        ? 30 * 24 * 60 * 60 * 1000 // 30 days if "remember me"
        : 7 * 24 * 60 * 60 * 1000; // 7 days default
    res.cookie('refreshToken', tokenPair.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: cookieMaxAge,
        path: '/api',
    });
    return api_response_1.default.success(res, {
        user: {
            id: user._id,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            preferredLanguage: user.preferredLanguage,
        },
        accessToken: tokenPair.accessToken,
    }, 'Login successful');
};
exports.login = login;
// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
const logout = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
        // Hash the token and remove it from the user's stored tokens
        const hashedToken = user_model_1.default.hashToken(refreshToken);
        await user_model_1.default.updateOne({ _id: req.user.userId }, { $pull: { refreshTokens: hashedToken } });
    }
    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api',
    });
    return api_response_1.default.success(res, null, 'Logged out successfully');
};
exports.logout = logout;
// ---------------------------------------------------------------------------
// Refresh Token
// ---------------------------------------------------------------------------
const refreshToken = async (req, res) => {
    // 1. Get refresh token from cookie
    const oldRefreshToken = req.cookies?.refreshToken;
    if (!oldRefreshToken) {
        throw new api_error_1.UnauthorizedError('Refresh token is missing');
    }
    // 2. Verify the refresh token
    const decoded = (0, jwt_1.verifyRefreshToken)(oldRefreshToken);
    // 3. Find user
    const user = await user_model_1.default.findById(decoded.userId)
        .select('+refreshTokens +tokenVersion');
    if (!user) {
        throw new api_error_1.UnauthorizedError('User not found');
    }
    if (!user.isActive) {
        throw new api_error_1.UnauthorizedError('Account is deactivated');
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
        throw new api_error_1.UnauthorizedError('Token version mismatch — please login again');
    }
    // 5. Verify the hashed token exists in user's stored tokens
    const hashedOldToken = user_model_1.default.hashToken(oldRefreshToken);
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
        throw new api_error_1.UnauthorizedError('Token reuse detected — all sessions invalidated');
    }
    // 6. Remove old token, generate new pair (token rotation)
    user.refreshTokens = user.refreshTokens.filter((t) => t !== hashedOldToken);
    const newTokenPair = (0, jwt_1.generateTokenPair)({
        userId: user._id.toString(),
        role: user.role,
        permissions: [],
    }, { userId: user._id.toString(), tokenVersion: user.tokenVersion });
    const hashedNewToken = user_model_1.default.hashToken(newTokenPair.refreshToken);
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
    return api_response_1.default.success(res, { accessToken: newTokenPair.accessToken }, 'Token refreshed successfully');
};
exports.refreshToken = refreshToken;
// ---------------------------------------------------------------------------
// Get Current User (Me)
// ---------------------------------------------------------------------------
const getMe = async (req, res) => {
    const user = await user_model_1.default.findById(req.user.userId);
    if (!user) {
        throw new api_error_1.NotFoundError('User');
    }
    const profile = await profile_model_1.default.findOne({ user: user._id });
    return api_response_1.default.success(res, {
        user,
        profile,
    });
};
exports.getMe = getMe;
// ---------------------------------------------------------------------------
// Update Preferences (Me)
// ---------------------------------------------------------------------------
const updatePreferences = async (req, res) => {
    const { preferredLanguage } = req.body;
    const updates = {};
    if (preferredLanguage)
        updates.preferredLanguage = preferredLanguage;
    const user = await user_model_1.default.findByIdAndUpdate(req.user.userId, updates, { new: true });
    if (!user)
        throw new api_error_1.NotFoundError('User');
    return api_response_1.default.success(res, { user }, 'Preferences updated');
};
exports.updatePreferences = updatePreferences;
// ---------------------------------------------------------------------------
// Forgot Password
// ---------------------------------------------------------------------------
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    const user = await user_model_1.default.findOne({ email: email.toLowerCase() });
    if (!user) {
        // Return success even if user not found (prevent email enumeration)
        return api_response_1.default.success(res, null, 'If an account with that email exists, a password reset link has been sent.');
    }
    // Generate reset token
    const resetToken = crypto_1.default.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto_1.default.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateBeforeSave: false });
    // TODO: Send password reset email with resetToken
    return api_response_1.default.success(res, null, 'If an account with that email exists, a password reset link has been sent.');
};
exports.forgotPassword = forgotPassword;
// ---------------------------------------------------------------------------
// Reset Password
// ---------------------------------------------------------------------------
const resetPassword = async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;
    // Hash the token from the URL
    const hashedToken = crypto_1.default.createHash('sha256').update(token).digest('hex');
    const user = await user_model_1.default.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires +tokenVersion +refreshTokens');
    if (!user) {
        throw new api_error_1.BadRequestError('Password reset token is invalid or has expired');
    }
    // Update password and invalidate all existing sessions
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.tokenVersion += 1; // invalidates all refresh tokens
    user.refreshTokens = []; // clear all stored refresh tokens
    await user.save();
    return api_response_1.default.success(res, null, 'Password has been reset successfully. Please login with your new password.');
};
exports.resetPassword = resetPassword;
// ---------------------------------------------------------------------------
// Verify Email
// ---------------------------------------------------------------------------
const verifyEmail = async (req, res) => {
    const { token } = req.params;
    const user = await user_model_1.default.findOne({
        verificationToken: token,
        verificationTokenExpires: { $gt: new Date() },
    }).select('+verificationToken +verificationTokenExpires');
    if (!user) {
        throw new api_error_1.BadRequestError('Verification token is invalid or has expired');
    }
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return api_response_1.default.success(res, null, 'Email verified successfully');
};
exports.verifyEmail = verifyEmail;
// ---------------------------------------------------------------------------
// Change Password (authenticated)
// ---------------------------------------------------------------------------
const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await user_model_1.default.findById(req.user.userId).select('+password +tokenVersion +refreshTokens');
    if (!user) {
        throw new api_error_1.NotFoundError('User');
    }
    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
        throw new api_error_1.BadRequestError('Current password is incorrect');
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
    return api_response_1.default.success(res, null, 'Password changed successfully. Please login again.');
};
exports.changePassword = changePassword;
//# sourceMappingURL=auth.controller.js.map