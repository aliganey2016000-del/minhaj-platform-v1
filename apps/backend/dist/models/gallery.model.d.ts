import mongoose, { Document } from 'mongoose';
export interface IGallery extends Document {
    title: string;
    description?: string;
    imageUrl: string;
    album: string;
    status: 'active' | 'inactive';
    uploadedBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IGallery, {}, {}, {}, mongoose.Document<unknown, {}, IGallery, {}, {}> & IGallery & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=gallery.model.d.ts.map