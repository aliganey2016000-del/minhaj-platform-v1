"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearLogs = exports.getLogs = exports.updateSettings = exports.getSettings = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const setting_model_1 = __importDefault(require("../models/setting.model"));
const activity_log_model_1 = __importDefault(require("../models/activity-log.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
// ── Settings ──
const getSettings = async (_req, res) => {
    const settings = await setting_model_1.default.find().lean();
    return api_response_1.default.success(res, settings);
};
exports.getSettings = getSettings;
const updateSettings = async (req, res) => {
    const { settings } = req.body; // [{ key, value, description }]
    if (!Array.isArray(settings))
        throw new api_error_1.BadRequestError('settings array required');
    for (const s of settings) {
        await setting_model_1.default.findOneAndUpdate({ key: s.key }, { value: s.value, description: s.description || '', updatedBy: new mongoose_1.default.Types.ObjectId(req.user.userId) }, { upsert: true, new: true });
    }
    const all = await setting_model_1.default.find().lean();
    return api_response_1.default.success(res, all, 'Settings updated');
};
exports.updateSettings = updateSettings;
// ── Activity Logs ──
const getLogs = async (req, res) => {
    const { action, user, page = '1', limit = '30', search } = req.query;
    const filter = {};
    if (action)
        filter.action = action;
    if (user)
        filter.user = user;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 30));
    const [logs, total] = await Promise.all([
        activity_log_model_1.default.find(filter).populate('user', 'email role').sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
        activity_log_model_1.default.countDocuments(filter),
    ]);
    let result = logs;
    if (search) {
        const s = search.toLowerCase();
        result = logs.filter((l) => (l.resource || '').toLowerCase().includes(s) || (l.details || '').toLowerCase().includes(s) || (l.user?.email || '').toLowerCase().includes(s));
    }
    return api_response_1.default.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};
exports.getLogs = getLogs;
const clearLogs = async (_req, res) => {
    await activity_log_model_1.default.deleteMany({});
    return api_response_1.default.success(res, null, 'All logs cleared');
};
exports.clearLogs = clearLogs;
//# sourceMappingURL=system.controller.js.map