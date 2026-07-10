"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationSchema = exports.objectIdSchema = exports.validate = void 0;
const joi_1 = __importDefault(require("joi"));
const api_error_1 = require("../utils/api-error");
/**
 * Returns middleware that validates the specified request property
 * against a Joi schema.
 *
 * @param schema  - Joi schema to validate against.
 * @param property - Which part of the request to validate (default: 'body').
 */
const validate = (schema, property = 'body') => {
    return (req, _res, next) => {
        const { error, value } = schema.validate(req[property], {
            abortEarly: false, // Collect all errors, not just the first
            stripUnknown: true, // Remove unknown fields (security)
            allowUnknown: true, // Allow extra fields (will be stripped)
        });
        if (error) {
            const errors = error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message.replace(/"/g, ''),
            }));
            return next(new api_error_1.ValidationError(errors));
        }
        // Replace the request property with the validated (and sanitized) value
        req[property] = value;
        next();
    };
};
exports.validate = validate;
// ---------------------------------------------------------------------------
// Common Validation Schemas (reusable)
// ---------------------------------------------------------------------------
/** Validates MongoDB ObjectId format in params */
exports.objectIdSchema = joi_1.default.object({
    id: joi_1.default.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
        'string.pattern.base': 'Invalid ID format — must be a 24-character hex string',
        'any.required': 'ID is required',
    }),
});
/** Validates pagination query parameters */
exports.paginationSchema = joi_1.default.object({
    page: joi_1.default.number().integer().min(1).default(1),
    limit: joi_1.default.number().integer().min(1).max(100).default(20),
    sort: joi_1.default.string().default('-createdAt'),
    search: joi_1.default.string().allow('').default(''),
}).unknown(true); // Allow additional query params for filtering
//# sourceMappingURL=validate.middleware.js.map