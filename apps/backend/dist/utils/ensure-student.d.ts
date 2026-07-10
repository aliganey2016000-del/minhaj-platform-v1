/**
 * ensureStudentRecord — Guarantees a Student document exists for a given User.
 *
 * This utility is used by all student-facing endpoints to prevent the
 * "Student record not found" error.  When a User with role="student" has
 * no corresponding Student document (e.g. orphaned after a partial
 * registration or created by an admin), one is automatically created with
 * the same defaults used during self-registration (Public School / Public Class).
 */
import mongoose from 'mongoose';
export declare function ensureStudentRecord(userId: string | mongoose.Types.ObjectId): Promise<mongoose.Document & {
    _id: mongoose.Types.ObjectId;
    enrolledCourses: mongoose.Types.ObjectId[];
}>;
export default ensureStudentRecord;
//# sourceMappingURL=ensure-student.d.ts.map