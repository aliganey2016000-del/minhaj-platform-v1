"use strict";
/**
 * Progress Model
 * Tracks a student's progress within an enrolled course.
 * Each document represents one student's journey through one course.
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
const mongoose_1 = __importStar(require("mongoose"));
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const progressSchema = new mongoose_1.Schema({
    student: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student reference is required'],
        index: true,
    },
    course: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Course',
        required: [true, 'Course reference is required'],
        index: true,
    },
    completedLessons: {
        type: Number,
        default: 0,
        min: 0,
    },
    completedQuizzes: {
        type: Number,
        default: 0,
        min: 0,
    },
    completedAssignments: {
        type: Number,
        default: 0,
        min: 0,
    },
    totalItems: {
        type: Number,
        default: 0,
        min: 0,
    },
    lastAccessed: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        enum: ['in_progress', 'completed'],
        default: 'in_progress',
        index: true,
    },
}, {
    timestamps: true,
    toJSON: {
        transform(_doc, ret) {
            delete ret.__v;
            return ret;
        },
    },
});
// ---------------------------------------------------------------------------
// Compound Index — one progress record per student per course
// ---------------------------------------------------------------------------
progressSchema.index({ student: 1, course: 1 }, { unique: true });
progressSchema.index({ student: 1, status: 1 });
progressSchema.index({ lastAccessed: -1 });
// ---------------------------------------------------------------------------
// Virtual — computed progress percentage
// ---------------------------------------------------------------------------
progressSchema.virtual('progressPercent').get(function () {
    if (this.totalItems === 0)
        return 0;
    const completed = this.completedLessons + this.completedQuizzes + this.completedAssignments;
    return Math.round((completed / this.totalItems) * 100);
});
progressSchema.set('toJSON', { virtuals: true });
progressSchema.set('toObject', { virtuals: true });
// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------
const Progress = mongoose_1.default.model('Progress', progressSchema);
exports.default = Progress;
//# sourceMappingURL=progress.model.js.map