"use strict";
/**
 * Auth Validators
 * Joi validation schemas for authentication routes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePasswordSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.registerSchema = void 0;
const joi_1 = __importDefault(require("joi"));
// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------
exports.registerSchema = joi_1.default.object({
    email: joi_1.default.string()
        .email()
        .required()
        .max(255)
        .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
    }),
    password: joi_1.default.string()
        .min(8)
        .max(128)
        .required()
        .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.max': 'Password cannot exceed 128 characters',
        'any.required': 'Password is required',
    }),
    firstName: joi_1.default.string().required().max(50).messages({
        'any.required': 'First name is required',
        'string.max': 'First name cannot exceed 50 characters',
    }),
    lastName: joi_1.default.string().required().max(50).messages({
        'any.required': 'Last name is required',
        'string.max': 'Last name cannot exceed 50 characters',
    }),
    gender: joi_1.default.string().valid('male', 'female').required().messages({
        'any.only': 'Gender must be either "male" or "female"',
        'any.required': 'Gender is required',
    }),
    phone: joi_1.default.string().optional().allow('').max(20),
    role: joi_1.default.string()
        .valid('admin', 'teacher', 'student', 'parent')
        .default('student')
        .messages({
        'any.only': 'Invalid role',
    }),
    preferredLanguage: joi_1.default.string()
        .valid('en', 'so', 'ar')
        .default('en')
        .messages({
        'any.only': 'Language must be one of: en, so, ar',
    }),
});
// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
exports.loginSchema = joi_1.default.object({
    email: joi_1.default.string().email().required().messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
    }),
    password: joi_1.default.string().required().messages({
        'any.required': 'Password is required',
    }),
    rememberMe: joi_1.default.boolean().default(false),
});
// ---------------------------------------------------------------------------
// Forgot Password
// ---------------------------------------------------------------------------
exports.forgotPasswordSchema = joi_1.default.object({
    email: joi_1.default.string().email().required().messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
    }),
});
// ---------------------------------------------------------------------------
// Reset Password
// ---------------------------------------------------------------------------
exports.resetPasswordSchema = joi_1.default.object({
    password: joi_1.default.string()
        .min(8)
        .max(128)
        .required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'any.required': 'Password is required',
    }),
    confirmPassword: joi_1.default.string().valid(joi_1.default.ref('password')).required().messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Please confirm your password',
    }),
});
// ---------------------------------------------------------------------------
// Change Password
// ---------------------------------------------------------------------------
exports.changePasswordSchema = joi_1.default.object({
    currentPassword: joi_1.default.string().required().messages({
        'any.required': 'Current password is required',
    }),
    newPassword: joi_1.default.string()
        .min(8)
        .max(128)
        .required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .messages({
        'string.min': 'New password must be at least 8 characters',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'any.required': 'New password is required',
    }),
});
//# sourceMappingURL=auth.validator.js.map