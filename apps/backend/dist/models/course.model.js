"use strict";
/**
 * Course Model
 * Islamic educational courses/programs with full multilingual support.
 * Supports syllabus/modules, teacher assignment, enrollment tracking, and fees.
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
const moduleSchema = new mongoose_1.Schema({
    week: {
        type: Number,
        required: [true, 'Module week number is required'],
        min: [1, 'Week must be at least 1'],
    },
    title: {
        en: { type: String, required: [true, 'English title is required'], trim: true },
        so: { type: String, default: '', trim: true },
        ar: { type: String, default: '', trim: true },
    },
    description: {
        en: { type: String, default: '', trim: true },
        so: { type: String, default: '', trim: true },
        ar: { type: String, default: '', trim: true },
    },
    resources: [{ type: String }],
}, { _id: true });
const courseSchema = new mongoose_1.Schema({
    title: {
        en: {
            type: String,
            required: [true, 'English title is required'],
            trim: true,
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        so: { type: String, default: '', trim: true, maxlength: 200 },
        ar: { type: String, default: '', trim: true, maxlength: 200 },
    },
    slug: {
        type: String,
        required: [true, 'Slug is required'],
        unique: true,
        lowercase: true,
        trim: true,
    },
    description: {
        en: { type: String, default: '', trim: true, maxlength: 5000 },
        so: { type: String, default: '', trim: true, maxlength: 5000 },
        ar: { type: String, default: '', trim: true, maxlength: 5000 },
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: {
            values: ['quran', 'fiqh', 'aqeedah', 'seerah', 'arabic', 'tajweed', 'hadith', 'akhlaq'],
            message: '{VALUE} is not a valid course category',
        },
        index: true,
    },
    level: {
        type: String,
        required: [true, 'Level is required'],
        enum: {
            values: ['beginner', 'intermediate', 'advanced'],
            message: '{VALUE} is not a valid level',
        },
    },
    duration: {
        type: Number,
        required: [true, 'Duration is required'],
        min: [1, 'Duration must be at least 1 week'],
    },
    fee: {
        type: Number,
        default: 0,
        min: [0, 'Fee cannot be negative'],
    },
    teacher: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Teacher',
        default: null,
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
    maxStudents: {
        type: Number,
        required: [true, 'Maximum students is required'],
        min: [1, 'Must allow at least 1 student'],
    },
    enrolledStudents: {
        type: Number,
        default: 0,
        min: 0,
    },
    thumbnail: {
        type: String,
        default: null,
    },
    syllabus: {
        type: [moduleSchema],
        default: [],
        validate: {
            validator: function (modules) {
                // Validate unique week numbers
                const weeks = modules.map((m) => m.week);
                return new Set(weeks).size === weeks.length;
            },
            message: 'Syllabus contains duplicate week numbers',
        },
    },
    prerequisites: {
        type: [String],
        default: [],
    },
    status: {
        type: String,
        required: true,
        enum: {
            values: ['draft', 'published', 'archived'],
            message: '{VALUE} is not a valid status',
        },
        default: 'draft',
        index: true,
    },
    startDate: {
        type: Date,
        default: null,
    },
    endDate: {
        type: Date,
        default: null,
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
courseSchema.index({ slug: 1 }, { unique: true });
courseSchema.index({ category: 1 });
courseSchema.index({ status: 1 });
courseSchema.index({ teacher: 1 });
courseSchema.index({ level: 1 });
courseSchema.index({ fee: 1 }); // For filtering free vs paid courses
courseSchema.index({ startDate: 1 }); // For upcoming courses
// Compound indexes for common queries
courseSchema.index({ status: 1, category: 1 });
courseSchema.index({ status: 1, level: 1 });
// ---------------------------------------------------------------------------
// Virtual — Available Seats
// ---------------------------------------------------------------------------
courseSchema.virtual('availableSeats').get(function () {
    return Math.max(0, this.maxStudents - this.enrolledStudents);
});
courseSchema.virtual('isFull').get(function () {
    return this.enrolledStudents >= this.maxStudents;
});
courseSchema.set('toJSON', { virtuals: true });
courseSchema.set('toObject', { virtuals: true });
// ---------------------------------------------------------------------------
// Pre-save Hook — Auto-generate slug if not provided
// ---------------------------------------------------------------------------
courseSchema.pre('save', function (next) {
    if (!this.slug && this.title?.en) {
        this.slug = this.title.en
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 100);
    }
    next();
});
// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------
const Course = mongoose_1.default.model('Course', courseSchema);
exports.default = Course;
//# sourceMappingURL=course.model.js.map