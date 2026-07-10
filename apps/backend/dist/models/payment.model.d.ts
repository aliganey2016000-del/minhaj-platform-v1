import mongoose, { Document } from 'mongoose';
export interface IPayment extends Document {
    student: mongoose.Types.ObjectId;
    amount: number;
    type: 'tuition' | 'registration' | 'exam' | 'material' | 'donation' | 'other';
    method: 'cash' | 'bank_transfer' | 'mobile_money' | 'online';
    status: 'completed' | 'pending' | 'refunded';
    notes: string;
    recordedBy: mongoose.Types.ObjectId;
    dueDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IPayment, {}, {}, {}, mongoose.Document<unknown, {}, IPayment, {}, {}> & IPayment & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=payment.model.d.ts.map