import mongoose, { Document } from 'mongoose';
export interface IClass extends Document {
    school: mongoose.Types.ObjectId;
    title: string;
    section: string;
    room: string;
    course?: mongoose.Types.ObjectId;
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    meetingLink?: string;
    teacher?: mongoose.Types.ObjectId;
    status: 'active' | 'inactive' | 'completed';
    createdAt: Date;
    updatedAt: Date;
}
declare const ClassModel: mongoose.Model<IClass, {}, {}, {}, mongoose.Document<unknown, {}, IClass, {}, {}> & IClass & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default ClassModel;
//# sourceMappingURL=class.model.d.ts.map