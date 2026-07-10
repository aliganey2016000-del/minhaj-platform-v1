"use strict";
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
const certificateController = __importStar(require("../../controllers/certificate.controller"));
const auth_middleware_1 = require("../../middleware/auth.middleware");
const role_middleware_1 = require("../../middleware/role.middleware");
const async_handler_middleware_1 = require("../../middleware/async-handler.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
router.get('/my', (0, role_middleware_1.roleMiddleware)(['student']), (0, async_handler_middleware_1.asyncHandler)(certificateController.getMyCertificates));
router.get('/', role_middleware_1.adminOrTeacher, (0, async_handler_middleware_1.asyncHandler)(certificateController.getAll));
router.get('/:id', (0, async_handler_middleware_1.asyncHandler)(certificateController.getAll)); // fallback — detailed get is via getAll with params
router.post('/', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(certificateController.create));
router.patch('/:id', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(certificateController.update));
router.patch('/:id/status', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(certificateController.updateStatus));
router.delete('/:id', role_middleware_1.adminOnly, (0, async_handler_middleware_1.asyncHandler)(certificateController.remove));
// Student/Parent can view their own
router.get('/student/:studentId', (0, role_middleware_1.roleMiddleware)(['admin', 'teacher', 'student', 'parent']), (0, async_handler_middleware_1.asyncHandler)((req, res) => {
    req.query.studentId = req.params.studentId;
    return certificateController.getAll(req, res);
}));
exports.default = router;
//# sourceMappingURL=certificate.routes.js.map