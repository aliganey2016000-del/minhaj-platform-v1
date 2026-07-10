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
type RequestProperty = 'body' | 'query' | 'params';
/**
 * Returns middleware that validates the specified request property
 * against a Joi schema.
 *
 * @param schema  - Joi schema to validate against.
 * @param property - Which part of the request to validate (default: 'body').
 */
export declare const validate: (schema: Joi.ObjectSchema, property?: RequestProperty) => (req: Request, _res: Response, next: NextFunction) => void;
/** Validates MongoDB ObjectId format in params */
export declare const objectIdSchema: Joi.ObjectSchema<any>;
/** Validates pagination query parameters */
export declare const paginationSchema: Joi.ObjectSchema<any>;
export {};
//# sourceMappingURL=validate.middleware.d.ts.map