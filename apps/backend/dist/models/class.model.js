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
const mongoose_1 = __importStar(require("mongoose"));
const classSchema = new mongoose_1.Schema({
    school: { type: mongoose_1.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    section: { type: String, required: true, trim: true, maxlength: 10 },
    room: { type: String, required: true, trim: true, maxlength: 50 },
    course: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    dayOfWeek: { type: Number, min: 0, max: 6, default: null },
    startTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, default: null },
    endTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, default: null },
    meetingLink: { type: String, default: '' },
    teacher: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Teacher', default: null, index: true },
    status: { type: String, enum: ['active', 'inactive', 'completed'], default: 'active', index: true },
}, { timestamps: true, toJSON: { transform(_doc, ret) { delete ret.__v; return ret; } } });
classSchema.index({ school: 1 });
classSchema.index({ status: 1 });
const ClassModel = mongoose_1.default.model('Class', classSchema);
exports.default = ClassModel;
//# sourceMappingURL=class.model.js.map