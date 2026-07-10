"use strict";
/**
 * Global Centralized Error Handler Middleware
 *
 * This must be the LAST middleware registered in the Express app.
 * It catches all errors thrown or passed via next(error) and returns a
 * standardized API response. In development mode it includes the stack trace;
 * in production it hides internal details and only exposes operational errors.
 *
 * Usage (in app.ts):
 *   // ... all routes and middleware
 *   app.use(errorHandler); // <-- LAST
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const api_error_1 = require("../utils/api-error");
const api_response_1 = __importDefault(require("../utils/api-response"));
// ---------------------------------------------------------------------------
// Error Handler
// ---------------------------------------------------------------------------
const errorHandler = (err, req, res, _next) => {
    // --------------------------------------
    // 1. Determine if this is an operational error (our ApiError)
    // --------------------------------------
    if (err instanceof api_error_1.ApiError) {
        return void api_response_1.default.error(res, err.statusCode, err.message, err.errors);
    }
    // --------------------------------------
    // 2. Handle Mongoose Validation Errors
    // --------------------------------------
    if (err.name === 'ValidationError') {
        const validationErr = err;
        const errors = Object.values(validationErr.errors).map((e) => ({
            field: e.path,
            message: e.message,
        }));
        return void api_response_1.default.error(res, 422, 'Validation failed — please check your input', errors);
    }
    // --------------------------------------
    // 3. Handle Mongoose CastError (invalid ObjectId etc.)
    // --------------------------------------
    if (err.name === 'CastError') {
        const castErr = err;
        return void api_response_1.default.error(res, 400, `Invalid value for field "${castErr.path}": "${castErr.value}"`);
    }
    // --------------------------------------
    // 4. Handle MongoDB Duplicate Key Error (code 11000)
    // --------------------------------------
    if (err.code === 11000) {
        const dupErr = err;
        const fields = Object.keys(dupErr.keyValue).join(', ');
        return void api_response_1.default.error(res, 409, `Duplicate value for field(s): ${fields}. This resource already exists.`);
    }
    // --------------------------------------
    // 5. Handle JWT Errors (from express-jwt or jsonwebtoken)
    // --------------------------------------
    if (err.name === 'UnauthorizedError') {
        return void api_response_1.default.error(res, 401, 'Invalid or expired token');
    }
    if (err.name === 'JsonWebTokenError') {
        return void api_response_1.default.error(res, 401, 'Invalid token');
    }
    if (err.name === 'TokenExpiredError') {
        return void api_response_1.default.error(res, 401, 'Token has expired');
    }
    // --------------------------------------
    // 6. Handle SyntaxError (malformed JSON in request body)
    // --------------------------------------
    if (err instanceof SyntaxError && 'body' in err) {
        return void api_response_1.default.error(res, 400, 'Invalid JSON in request body');
    }
    // --------------------------------------
    // 7. Development: Log full error + return stack trace
    // --------------------------------------
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('💥 UNHANDLED ERROR');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('  Name:   ', err.name);
        console.error('  Message:', err.message);
        console.error('  Stack:  ', err.stack);
        console.error('  Path:   ', req.method, req.originalUrl);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return void api_response_1.default.error(res, 500, isProduction
            ? 'Internal server error'
            : `${err.name}: ${err.message}`);
    }
    // --------------------------------------
    // 8. Production: Hide internal details, log safely
    // --------------------------------------
    // In production, you would send the error to a monitoring service (e.g. Sentry)
    // Sentry.captureException(err);
    console.error(`[${new Date().toISOString()}] ERROR:`, {
        name: err.name,
        message: err.message,
        path: req.originalUrl,
        method: req.method,
    });
    return void api_response_1.default.error(res, 500, 'An unexpected error occurred. Please try again later or contact support.');
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=error.middleware.js.map