/**
 * Student Model
 * Extends User & Profile with student-specific academic data.
 * Tracks enrollment, courses, attendance logs (summary), and academic results (summary).
 */
import mongoose, { Document } from 'mongoose';
export interface IStudent extends Document {
    _id: mongoose.Types.ObjectId;
    user: mongoose.Types.ObjectId;
    profile: mongoose.Types.ObjectId;
    studentId: string;
    parent?: mongoose.Types.ObjectId;
    enrollmentDate: Date;
    status: 'active' | 'inactive' | 'graduated' | 'suspended';
    approvalStatus: 'pending' | 'approved' | 'rejected';
    school?: mongoose.Types.ObjectId;
    class?: mongoose.Types.ObjectId;
    grade?: string;
    medicalNotes?: string;
    enrolledCourses: mongoose.Types.ObjectId[];
    attendancePercentage?: number;
    gpa?: number;
    totalFeesPaid?: number;
    totalFeesDue?: number;
    createdAt: Date;
    updatedAt: Date;
}
declare const Student: mongoose.Model<IStudent, {}, {}, {}, mongoose.Document<unknown, {}, IStudent, {}, {}> & IStudent & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default Student;
//# sourceMappingURL=student.model.d.ts.map