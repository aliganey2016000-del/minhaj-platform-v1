import mongoose, { Document } from 'mongoose';
export interface IAnnouncement extends Document {
    title: string;
    content: string;
    audience: 'all' | 'students' | 'parents' | 'teachers';
    isPinned: boolean;
    status: 'active' | 'inactive';
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IAnnouncement, {}, {}, {}, mongoose.Document<unknown, {}, IAnnouncement, {}, {}> & IAnnouncement & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=announcement.model.d.ts.map