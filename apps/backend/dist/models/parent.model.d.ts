import mongoose, { Document } from 'mongoose';
export interface IParent extends Document {
    user: mongoose.Types.ObjectId;
    profile: mongoose.Types.ObjectId;
    parentId: string;
    children: mongoose.Types.ObjectId[];
    occupation?: string;
    relationship: string;
    address?: string;
    status: 'active' | 'inactive';
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IParent, {}, {}, {}, mongoose.Document<unknown, {}, IParent, {}, {}> & IParent & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=parent.model.d.ts.map