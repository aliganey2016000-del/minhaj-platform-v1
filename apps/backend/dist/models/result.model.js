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
const resultSchema = new mongoose_1.Schema({
    exam: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    marksObtained: { type: Number, required: true, min: 0 },
    totalMarks: { type: Number, required: true, min: 1 },
    percentage: { type: Number, default: 0 },
    grade: { type: String, default: 'F', maxlength: 5 },
    remarks: { type: String, default: '' },
    status: { type: String, enum: ['passed', 'failed', 'absent'], default: 'failed', index: true },
    enteredBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, toJSON: { transform(_doc, ret) { delete ret.__v; return ret; } } });
resultSchema.index({ exam: 1, student: 1 }, { unique: true });
resultSchema.index({ student: 1 });
resultSchema.index({ status: 1 });
// Auto-calculate percentage and grade
resultSchema.pre('save', function (next) {
    if (this.totalMarks > 0) {
        this.percentage = Math.round((this.marksObtained / this.totalMarks) * 100);
    }
    if (this.status === 'absent') {
        this.marksObtained = 0;
        this.percentage = 0;
        this.grade = 'N/A';
    }
    else {
        const p = this.percentage;
        if (p >= 90)
            this.grade = 'A+';
        else if (p >= 80)
            this.grade = 'A';
        else if (p >= 70)
            this.grade = 'B';
        else if (p >= 60)
            this.grade = 'C';
        else if (p >= 50)
            this.grade = 'D';
        else
            this.grade = 'F';
    }
    if (this.status !== 'absent') {
        const passThreshold = 50; // 50% default passing mark
        this.status = this.percentage >= passThreshold ? 'passed' : 'failed';
    }
    next();
});
exports.default = mongoose_1.default.model('Result', resultSchema);
//# sourceMappingURL=result.model.js.map