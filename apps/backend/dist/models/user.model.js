"use strict";
/**
 * User Model
 * Central authentication collection. All roles (admin, teacher, student, parent)
 * derive from this base document. Stores credentials, verification status,
 * language preference, and hashed refresh tokens for token rotation.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const userSchema = new mongoose_1.Schema({
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    phone: {
        type: String,
        unique: true,
        sparse: true, // allows multiple null values for uniqueness
        trim: true,
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        select: false, // never returned in queries by default
    },
    role: {
        type: String,
        required: [true, 'Role is required'],
        enum: {
            values: ['admin', 'teacher', 'student', 'parent'],
            message: '{VALUE} is not a valid role',
        },
        index: true,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    lastLogin: {
        type: Date,
        default: null,
    },
    preferredLanguage: {
        type: String,
        enum: ['en', 'so', 'ar'],
        default: 'en',
    },
    refreshTokens: {
        type: [String],
        default: [],
        select: false,
    },
    tokenVersion: {
        type: Number,
        default: 0,
        select: false,
    },
    verificationToken: {
        type: String,
        select: false,
    },
    verificationTokenExpires: {
        type: Date,
        select: false,
    },
    passwordResetToken: {
        type: String,
        select: false,
    },
    passwordResetExpires: {
        type: Date,
        select: false,
    },
    failedLoginAttempts: {
        type: Number,
        default: 0,
        select: false,
    },
    lockedUntil: {
        type: Date,
        default: null,
        select: false,
    },
}, {
    timestamps: true,
    toJSON: {
        transform(_doc, ret) {
            ret.password = undefined;
            ret.refreshTokens = undefined;
            ret.tokenVersion = undefined;
            ret.verificationToken = undefined;
            ret.verificationTokenExpires = undefined;
            ret.passwordResetToken = undefined;
            ret.passwordResetExpires = undefined;
            ret.failedLoginAttempts = undefined;
            ret.lockedUntil = undefined;
            delete ret.__v;
            return ret;
        },
    },
});
// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
// ---------------------------------------------------------------------------
// Pre-save Hook — Hash password & email verification token
// ---------------------------------------------------------------------------
userSchema.pre('save', async function (next) {
    // Only hash password if it has been modified (or is new)
    if (!this.isModified('password'))
        return next();
    try {
        const salt = await bcrypt_1.default.genSalt(12);
        this.password = await bcrypt_1.default.hash(this.password, salt);
        next();
    }
    catch (error) {
        next(error);
    }
});
// ---------------------------------------------------------------------------
// Instance Methods
// ---------------------------------------------------------------------------
/**
 * Compare a candidate password against the stored hash.
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt_1.default.compare(candidatePassword, this.password);
};
/**
 * Check if the account is temporarily locked due to too many failed attempts.
 */
userSchema.methods.isLocked = function () {
    if (!this.lockedUntil)
        return false;
    // If lock period has passed, unlock automatically
    if (this.lockedUntil < new Date()) {
        this.lockedUntil = undefined;
        this.failedLoginAttempts = 0;
        return false;
    }
    return true;
};
// ---------------------------------------------------------------------------
// Static Methods
// ---------------------------------------------------------------------------
/**
 * Hash a token (used for refresh tokens stored in the user document).
 */
userSchema.statics.hashToken = function (token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
};
// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------
const User = mongoose_1.default.model('User', userSchema);
exports.default = User;
//# sourceMappingURL=user.model.js.map