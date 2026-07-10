import mongoose, { Document } from 'mongoose';
export interface IAssignment extends Document {
    title: string;
    description: string;
    course: mongoose.Types.ObjectId;
    dueDate: Date;
    totalMarks: number;
    allowLateSubmission: boolean;
    attachments: string[];
    status: 'active' | 'inactive';
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IAssignment, {}, {}, {}, mongoose.Document<unknown, {}, IAssignment, {}, {}> & IAssignment & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=assignment.model.d.ts.map