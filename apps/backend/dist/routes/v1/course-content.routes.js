"use strict";
/**
 * Course Content Routes — /api/v1/courses/:courseId/content
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const contentController = __importStar(require("../../controllers/course-content.controller"));
const auth_middleware_1 = require("../../middleware/auth.middleware");
const role_middleware_1 = require("../../middleware/role.middleware");
const async_handler_middleware_1 = require("../../middleware/async-handler.middleware");
const router = (0, express_1.Router)({ mergeParams: true });
// All routes require auth + admin/teacher
router.use(auth_middleware_1.authMiddleware);
router.use(role_middleware_1.adminOrTeacher);
// GET /api/v1/courses/:courseId/content
router.get('/', (0, async_handler_middleware_1.asyncHandler)(contentController.getByCourse));
// PUT /api/v1/courses/:courseId/content — full save / upsert
router.put('/', (0, async_handler_middleware_1.asyncHandler)(contentController.saveContent));
// PATCH /api/v1/courses/:courseId/content/chapters/reorder
router.patch('/chapters/reorder', (0, async_handler_middleware_1.asyncHandler)(contentController.reorderChapters));
// PATCH /api/v1/courses/:courseId/content/chapters/:chapterId/items/reorder
router.patch('/chapters/:chapterId/items/reorder', (0, async_handler_middleware_1.asyncHandler)(contentController.reorderItems));
// PATCH /api/v1/courses/:courseId/content/chapters/:chapterId/collapse
router.patch('/chapters/:chapterId/collapse', (0, async_handler_middleware_1.asyncHandler)(contentController.toggleChapterCollapse));
exports.default = router;
//# sourceMappingURL=course-content.routes.js.map