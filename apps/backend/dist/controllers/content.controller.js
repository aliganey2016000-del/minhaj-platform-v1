"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.remove = exports.togglePin = exports.updateStatus = exports.update = exports.create = exports.getAll = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
function getModel(name) {
    return mongoose_1.default.model(name);
}
// GET /
const getAll = (modelName) => async (req, res) => {
    const Model = getModel(modelName);
    const { status, page = '1', limit = '20', search, ...rest } = req.query;
    const filter = {};
    if (status)
        filter.status = status;
    // Additional filters from query
    for (const key of Object.keys(rest)) {
        if (key !== 'page' && key !== 'limit' && key !== 'search') {
            filter[key] = rest[key];
        }
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const [items, total] = await Promise.all([
        Model.find(filter)
            .populate('createdBy', 'email')
            .populate('uploadedBy', 'email')
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean(),
        Model.countDocuments(filter),
    ]);
    let result = items;
    if (search) {
        const s = search.toLowerCase();
        result = items.filter((item) => {
            const title = (item.title || '').toLowerCase();
            const content = (item.content || item.description || '').toLowerCase();
            const album = (item.album || '').toLowerCase();
            const location = (item.location || '').toLowerCase();
            return title.includes(s) || content.includes(s) || album.includes(s) || location.includes(s);
        });
    }
    return api_response_1.default.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};
exports.getAll = getAll;
// POST /
const create = (modelName) => async (req, res) => {
    const Model = getModel(modelName);
    const userIdField = modelName === 'Gallery' ? 'uploadedBy' : 'createdBy';
    const payload = { ...req.body, [userIdField]: new mongoose_1.default.Types.ObjectId(req.user.userId) };
    const item = await Model.create(payload);
    const populated = await Model.findById(item._id).populate(userIdField === 'uploadedBy' ? 'uploadedBy' : 'createdBy', 'email').lean();
    return api_response_1.default.created(res, populated, `${modelName} created successfully`);
};
exports.create = create;
// PATCH /:id
const update = (modelName) => async (req, res) => {
    const Model = getModel(modelName);
    const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
    if (!item)
        throw new api_error_1.NotFoundError(modelName);
    return api_response_1.default.success(res, item, `${modelName} updated`);
};
exports.update = update;
// PATCH /:id/status
const updateStatus = (modelName) => async (req, res) => {
    const { status } = req.body;
    if (!status)
        throw new api_error_1.BadRequestError('Status is required');
    const Model = getModel(modelName);
    const item = await Model.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!item)
        throw new api_error_1.NotFoundError(modelName);
    return api_response_1.default.success(res, item, `Status updated to ${status}`);
};
exports.updateStatus = updateStatus;
// PATCH /:id/toggle-pin (announcements only)
const togglePin = async (req, res) => {
    const item = await getModel('Announcement').findById(req.params.id);
    if (!item)
        throw new api_error_1.NotFoundError('Announcement');
    item.isPinned = !item.isPinned;
    await item.save();
    return api_response_1.default.success(res, item, item.isPinned ? 'Pinned' : 'Unpinned');
};
exports.togglePin = togglePin;
// DELETE /:id
const remove = (modelName) => async (req, res) => {
    const Model = getModel(modelName);
    const item = await Model.findByIdAndDelete(req.params.id);
    if (!item)
        throw new api_error_1.NotFoundError(modelName);
    return api_response_1.default.noContent(res, `${modelName} deleted`);
};
exports.remove = remove;
//# sourceMappingURL=content.controller.js.map