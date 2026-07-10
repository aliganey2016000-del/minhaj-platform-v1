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
const certificateSchema = new mongoose_1.Schema({
    title: { type: String, required: true, trim: true, maxlength: 200 },
    student: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    course: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    issueDate: { type: Date, required: true, default: Date.now },
    expiryDate: { type: Date, default: null },
    certificateNumber: { type: String, unique: true, required: true },
    grade: { type: String, default: '' },
    status: { type: String, enum: ['issued', 'revoked', 'expired'], default: 'issued', index: true },
    notes: { type: String, default: '' },
    issuedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, toJSON: { transform(_doc, ret) { delete ret.__v; return ret; } } });
certificateSchema.index({ certificateNumber: 1 }, { unique: true });
certificateSchema.index({ student: 1, course: 1 });
certificateSchema.index({ status: 1 });
// Auto-generate certificate number
certificateSchema.pre('validate', async function (next) {
    if (this.isNew && !this.certificateNumber) {
        const count = await mongoose_1.default.model('Certificate').countDocuments();
        const year = new Date().getFullYear();
        this.certificateNumber = `CERT-${year}-${String(count + 1).padStart(5, '0')}`;
    }
    next();
});
exports.default = mongoose_1.default.model('Certificate', certificateSchema);
//# sourceMappingURL=certificate.model.js.map