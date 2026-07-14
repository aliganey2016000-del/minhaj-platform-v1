/**
 * Auth Validators
 * Joi validation schemas for authentication routes.
 */

import Joi from 'joi';

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .max(255)
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password cannot exceed 128 characters',
      'any.required': 'Password is required',
    }),
  firstName: Joi.string().required().max(50).messages({
    'any.required': 'First name is required',
    'string.max': 'First name cannot exceed 50 characters',
  }),
  lastName: Joi.string().required().max(50).messages({
    'any.required': 'Last name is required',
    'string.max': 'Last name cannot exceed 50 characters',
  }),
  gender: Joi.string().valid('male', 'female').required().messages({
    'any.only': 'Gender must be either "male" or "female"',
    'any.required': 'Gender is required',
  }),
  phone: Joi.string().optional().allow('').max(20),
  preferredLanguage: Joi.string()
    .valid('en', 'so', 'ar')
    .default('en')
    .messages({
      'any.only': 'Language must be one of: en, so, ar',
    }),
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
  rememberMe: Joi.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Forgot Password
// ---------------------------------------------------------------------------

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
});

// ---------------------------------------------------------------------------
// Reset Password
// ---------------------------------------------------------------------------

export const resetPasswordSchema = Joi.object({
  password: Joi.string()
    .min(8)
    .max(128)
    .required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required',
    }),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
    'any.required': 'Please confirm your password',
  }),
});

// ---------------------------------------------------------------------------
// Change Password
// ---------------------------------------------------------------------------

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password is required',
  }),
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .messages({
      'string.min': 'New password must be at least 8 characters',
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'New password is required',
    }),
});