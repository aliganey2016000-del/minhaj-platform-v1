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
const teacherSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    profile: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Profile', required: true },
    school: { type: mongoose_1.Schema.Types.ObjectId, ref: 'School', default: undefined },
    teacherId: { type: String, unique: true, sparse: true },
    qualification: { type: String, default: '' },
    specialization: [{ type: String }],
    experience: { type: Number, default: 0 },
    bio: { type: String, default: '' },
    courses: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Course' }],
    joiningDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive', 'on_leave'], default: 'active' },
}, { timestamps: true, toJSON: { transform(_doc, ret) { delete ret.__v; return ret; } } });
exports.default = mongoose_1.default.model('Teacher', teacherSchema);
//# sourceMappingURL=teacher.model.js.map