import mongoose, { Document } from 'mongoose';
export interface IExam extends Document {
    title: string;
    course: mongoose.Types.ObjectId;
    examDate: Date;
    startTime: string;
    endTime: string;
    duration: number;
    totalMarks: number;
    passingMarks: number;
    room?: string;
    instructions?: string;
    status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IExam, {}, {}, {}, mongoose.Document<unknown, {}, IExam, {}, {}> & IExam & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=exam.model.d.ts.map