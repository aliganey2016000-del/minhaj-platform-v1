import mongoose, { Document } from 'mongoose';
export interface INews extends Document {
    title: string;
    content: string;
    image?: string;
    category: string;
    status: 'active' | 'inactive';
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<INews, {}, {}, {}, mongoose.Document<unknown, {}, INews, {}, {}> & INews & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=news.model.d.ts.map