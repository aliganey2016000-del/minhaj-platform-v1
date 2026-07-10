import mongoose, { Document } from 'mongoose';
export interface ITeacher extends Document {
    user: mongoose.Types.ObjectId;
    profile: mongoose.Types.ObjectId;
    school?: mongoose.Types.ObjectId;
    teacherId: string;
    qualification?: string;
    specialization?: string[];
    experience?: number;
    bio?: string;
    courses: mongoose.Types.ObjectId[];
    joiningDate: Date;
    status: 'active' | 'inactive' | 'on_leave';
}
declare const _default: mongoose.Model<ITeacher, {}, {}, {}, mongoose.Document<unknown, {}, ITeacher, {}, {}> & ITeacher & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=teacher.model.d.ts.map