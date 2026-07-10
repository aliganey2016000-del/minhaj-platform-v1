/**
 * Progress Model
 * Tracks a student's progress within an enrolled course.
 * Each document represents one student's journey through one course.
 */
import mongoose, { Document } from 'mongoose';
export interface IProgress extends Document {
    _id: mongoose.Types.ObjectId;
    student: mongoose.Types.ObjectId;
    course: mongoose.Types.ObjectId;
    completedLessons: number;
    completedQuizzes: number;
    completedAssignments: number;
    totalItems: number;
    lastAccessed: Date;
    status: 'in_progress' | 'completed';
    createdAt: Date;
    updatedAt: Date;
}
declare const Progress: mongoose.Model<IProgress, {}, {}, {}, mongoose.Document<unknown, {}, IProgress, {}, {}> & IProgress & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default Progress;
//# sourceMappingURL=progress.model.d.ts.map