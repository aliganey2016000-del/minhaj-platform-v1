import mongoose, { Document } from 'mongoose';
export interface ICertificate extends Document {
    title: string;
    student: mongoose.Types.ObjectId;
    course: mongoose.Types.ObjectId;
    issueDate: Date;
    expiryDate?: Date;
    certificateNumber: string;
    grade?: string;
    status: 'issued' | 'revoked' | 'expired';
    notes: string;
    issuedBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<ICertificate, {}, {}, {}, mongoose.Document<unknown, {}, ICertificate, {}, {}> & ICertificate & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=certificate.model.d.ts.map