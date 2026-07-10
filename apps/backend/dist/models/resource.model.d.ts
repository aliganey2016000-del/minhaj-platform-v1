import mongoose, { Document } from 'mongoose';
export interface IResource extends Document {
    title: string;
    description: string;
    course: mongoose.Types.ObjectId;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    category: string;
    status: 'active' | 'inactive';
    uploadedBy: mongoose.Types.ObjectId;
    downloads: number;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IResource, {}, {}, {}, mongoose.Document<unknown, {}, IResource, {}, {}> & IResource & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=resource.model.d.ts.map