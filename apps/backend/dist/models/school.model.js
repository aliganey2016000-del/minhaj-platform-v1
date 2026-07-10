"use strict";
/**
 * School Model
 *
 * Represents a registered school in the system.
 * Schools are managed by admins and can have students, teachers, and classes
 * associated with them.
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
const schoolSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: [true, 'School name is required'],
        trim: true,
        maxlength: [200, 'School name cannot exceed 200 characters'],
    },
    address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true,
        maxlength: [500, 'Address cannot exceed 500 characters'],
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
        maxlength: [20, 'Phone number cannot exceed 20 characters'],
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    principalName: {
        type: String,
        required: [true, 'Principal name is required'],
        trim: true,
        maxlength: [100, 'Principal name cannot exceed 100 characters'],
    },
    establishedYear: {
        type: Number,
        required: [true, 'Established year is required'],
        min: [1900, 'Year must be 1900 or later'],
        max: [new Date().getFullYear(), 'Year cannot be in the future'],
    },
    website: {
        type: String,
        default: '',
        trim: true,
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
        index: true,
    },
    createdBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
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
schoolSchema.index({ name: 1 });
schoolSchema.index({ status: 1 });
schoolSchema.index({ createdBy: 1 });
// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
const School = mongoose_1.default.model('School', schoolSchema);
exports.default = School;
//# sourceMappingURL=school.model.js.map