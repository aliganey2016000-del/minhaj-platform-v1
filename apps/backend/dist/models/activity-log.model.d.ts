import mongoose, { Document } from 'mongoose';
export interface IActivityLog extends Document {
    user: mongoose.Types.ObjectId;
    action: string;
    resource: string;
    resourceId?: string;
    details?: string;
    ip?: string;
    createdAt: Date;
}
declare const _default: mongoose.Model<IActivityLog, {}, {}, {}, mongoose.Document<unknown, {}, IActivityLog, {}, {}> & IActivityLog & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=activity-log.model.d.ts.map