/**
 * Validation Middleware
 *
 * Validates request body, query, or params against a Joi schema.
 * Automatically sends a 422 response with structured errors if validation fails.
 *
 * Usage:
 *   router.post('/users', validate(createUserSchema), userController.create);
 *   router.get('/users', validate(getUsersSchema, 'query'), userController.getAll);
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from '../utils/api-error';

type RequestProperty = 'body' | 'query' | 'params';

/**
 * Returns middleware that validates the specified request property
 * against a Joi schema.
 *
 * @param schema  - Joi schema to validate against.
 * @param property - Which part of the request to validate (default: 'body').
 */
export const validate = (
  schema: Joi.ObjectSchema,
  property: RequestProperty = 'body'
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,        // Collect all errors, not just the first
      stripUnknown: true,       // Remove unknown fields (security)
      allowUnknown: true,       // Allow extra fields (will be stripped)
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, ''),
      }));

      return next(new ValidationError(errors));
    }

    // Replace the request property with the validated (and sanitized) value
    req[property] = value;

    next();
  };
};

// ---------------------------------------------------------------------------
// Common Validation Schemas (reusable)
// ---------------------------------------------------------------------------

/** Validates MongoDB ObjectId format in params */
export const objectIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid ID format — must be a 24-character hex string',
      'any.required': 'ID is required',
    }),
});

/** Validates pagination query parameters */
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().default('-createdAt'),
  search: Joi.string().allow('').default(''),
}).unknown(true); // Allow additional query params for filtering