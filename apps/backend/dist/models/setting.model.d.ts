import mongoose, { Document } from 'mongoose';
export interface ISetting extends Document {
    key: string;
    value: string;
    description: string;
    updatedBy: mongoose.Types.ObjectId;
    updatedAt: Date;
}
declare const _default: mongoose.Model<ISetting, {}, {}, {}, mongoose.Document<unknown, {}, ISetting, {}, {}> & ISetting & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=setting.model.d.ts.map