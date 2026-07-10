"use strict";
/**
 * ensureStudentRecord — Guarantees a Student document exists for a given User.
 *
 * This utility is used by all student-facing endpoints to prevent the
 * "Student record not found" error.  When a User with role="student" has
 * no corresponding Student document (e.g. orphaned after a partial
 * registration or created by an admin), one is automatically created with
 * the same defaults used during self-registration (Public School / Public Class).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureStudentRecord = ensureStudentRecord;
const student_model_1 = __importDefault(require("../models/student.model"));
const profile_model_1 = __importDefault(require("../models/profile.model"));
const school_model_1 = __importDefault(require("../models/school.model"));
const class_model_1 = __importDefault(require("../models/class.model"));
// ---------------------------------------------------------------------------
// Ensure a Student record exists for the given userId.
// Returns the Student document (created if necessary).
// ---------------------------------------------------------------------------
async function ensureStudentRecord(userId) {
    // 1. Existing record → return it
    const existing = await student_model_1.default.findOne({ user: userId });
    if (existing)
        return existing;
    // 2. Look up the user's Profile (needed for Student creation)
    const profile = await profile_model_1.default.findOne({ user: userId });
    if (!profile) {
        throw new Error(`Cannot create Student record: no Profile exists for user ${userId}. ` +
            'Please complete your profile or contact an administrator.');
    }
    // 3. Find or create "Public School"
    let publicSchool = await school_model_1.default.findOne({ name: 'Public School' });
    if (!publicSchool) {
        publicSchool = await school_model_1.default.create({
            name: 'Public School',
            address: 'Online',
            phone: '+000',
            email: 'public@school.edu',
            principalName: 'Admin',
            establishedYear: new Date().getFullYear(),
            createdBy: userId,
        });
    }
    // 4. Find or create "Public Class"
    let publicClass = await class_model_1.default.findOne({
        school: publicSchool._id,
        title: 'Public Class',
    });
    if (!publicClass) {
        publicClass = await class_model_1.default.create({
            school: publicSchool._id,
            title: 'Public Class',
            section: 'A',
            room: 'Online',
        });
    }
    // 5. Create the Student document
    const student = await student_model_1.default.create({
        user: userId,
        profile: profile._id,
        enrollmentDate: new Date(),
        approvalStatus: 'approved', // auto-approved since they're already logged in
        school: publicSchool._id,
        class: publicClass._id,
    });
    return student;
}
exports.default = ensureStudentRecord;
//# sourceMappingURL=ensure-student.js.map