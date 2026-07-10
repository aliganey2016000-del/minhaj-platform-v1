"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_mongo_sanitize_1 = __importDefault(require("express-mongo-sanitize"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const morgan_1 = __importDefault(require("morgan"));
const routes_1 = __importDefault(require("./routes"));
const error_middleware_1 = require("./middleware/error.middleware");
const app = (0, express_1.default)();
// ---------------------------------------------------------------------------
// Trust proxy (required for rate limiting behind reverse proxy)
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);
// ---------------------------------------------------------------------------
// Security Middleware
// ---------------------------------------------------------------------------
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
}));
// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------
const limiter = (0, express_rate_limit_1.default)({
    windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW || '1')) * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000'),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        statusCode: 429,
        message: 'Too many requests, please try again later',
        data: null,
        errors: null,
    },
});
app.use('/api/', limiter);
// ---------------------------------------------------------------------------
// Body Parsing
// ---------------------------------------------------------------------------
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
// ---------------------------------------------------------------------------
// Data Sanitization
// ---------------------------------------------------------------------------
app.use((0, express_mongo_sanitize_1.default)());
// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
    app.use((0, morgan_1.default)('dev'));
}
// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use(routes_1.default);
// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Route not found',
        data: null,
        errors: null,
    });
});
// ---------------------------------------------------------------------------
// Global Error Handler (must be last)
// ---------------------------------------------------------------------------
app.use(error_middleware_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map