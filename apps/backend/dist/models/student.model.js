"use strict";
/**
 * Student Model
 * Extends User & Profile with student-specific academic data.
 * Tracks enrollment, courses, attendance logs (summary), and academic results (summary).
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
const studentSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User reference is required'],
        unique: true,
    },
    profile: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Profile',
        required: [true, 'Profile reference is required'],
        unique: true,
    },
    studentId: {
        type: String,
        required: [true, 'Student ID is required'],
        unique: true,
        trim: true,
        uppercase: true,
    },
    parent: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Parent',
        default: null,
        index: true,
    },
    enrollmentDate: {
        type: Date,
        required: [true, 'Enrollment date is required'],
        default: Date.now,
    },
    status: {
        type: String,
        required: true,
        enum: {
            values: ['active', 'inactive', 'graduated', 'suspended'],
            message: '{VALUE} is not a valid student status',
        },
        default: 'active',
        index: true,
    },
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'approved',
        index: true,
    },
    school: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'School',
        default: null,
        index: true,
    },
    class: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Class',
        default: null,
        index: true,
    },
    grade: {
        type: String,
        default: null,
    },
    medicalNotes: {
        type: String,
        default: null,
        maxlength: [500, 'Medical notes cannot exceed 500 characters'],
    },
    enrolledCourses: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Course',
        },
    ],
    // Dashboard summary fields (updated by service layer periodically)
    attendancePercentage: {
        type: Number,
        default: null,
        min: 0,
        max: 100,
    },
    gpa: {
        type: Number,
        default: null,
        min: 0,
        max: 4.0,
    },
    totalFeesPaid: {
        type: Number,
        default: 0,
        min: 0,
    },
    totalFeesDue: {
        type: Number,
        default: 0,
        min: 0,
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
// Indexes
// ---------------------------------------------------------------------------
studentSchema.index({ user: 1 }, { unique: true });
studentSchema.index({ studentId: 1 }, { unique: true });
studentSchema.index({ parent: 1 });
studentSchema.index({ school: 1 });
studentSchema.index({ class: 1 });
studentSchema.index({ approvalStatus: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ enrollmentDate: -1 });
// Compound index for filtering students by status + enrollment
studentSchema.index({ status: 1, enrollmentDate: -1 });
// ---------------------------------------------------------------------------
// Auto-generate Student ID Pre-save Hook
// ---------------------------------------------------------------------------
studentSchema.pre('validate', async function (next) {
    if (this.isNew && !this.studentId) {
        const currentYear = new Date().getFullYear();
        const count = await mongoose_1.default.model('Student').countDocuments();
        const paddedCount = String(count + 1).padStart(4, '0');
        this.studentId = `STU-${currentYear}-${paddedCount}`;
    }
    next();
});
// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------
const Student = mongoose_1.default.model('Student', studentSchema);
exports.default = Student;
//# sourceMappingURL=student.model.js.map