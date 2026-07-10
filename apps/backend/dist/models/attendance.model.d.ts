import mongoose, { Document } from 'mongoose';
export interface IAttendance extends Document {
    course: mongoose.Types.ObjectId;
    student: mongoose.Types.ObjectId;
    date: Date;
    status: 'present' | 'absent' | 'late' | 'excused';
    notes?: string;
    markedBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const Attendance: mongoose.Model<IAttendance, {}, {}, {}, mongoose.Document<unknown, {}, IAttendance, {}, {}> & IAttendance & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default Attendance;
//# sourceMappingURL=attendance.model.d.ts.map