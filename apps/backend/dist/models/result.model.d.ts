import mongoose, { Document } from 'mongoose';
export interface IResult extends Document {
    exam: mongoose.Types.ObjectId;
    student: mongoose.Types.ObjectId;
    marksObtained: number;
    totalMarks: number;
    percentage: number;
    grade: string;
    remarks: string;
    status: 'passed' | 'failed' | 'absent';
    enteredBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IResult, {}, {}, {}, mongoose.Document<unknown, {}, IResult, {}, {}> & IResult & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=result.model.d.ts.map