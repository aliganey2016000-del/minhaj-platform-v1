"use strict";
/**
 * Main Route Aggregator
 *
 * Mounts the v1 API routes under /api/v1.
 * This is the single entry point for all API routes in the application.
 *
 * Usage (in app.ts):
 *   import routes from './routes';
 *   app.use(routes);
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const v1_1 = __importDefault(require("./v1"));
const router = (0, express_1.Router)();
// Mount API version 1
router.use('/api/v1', v1_1.default);
// Future API versions:
// router.use('/api/v2', v2Routes);
exports.default = router;
//# sourceMappingURL=index.js.map