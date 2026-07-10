/**
 * School Model
 *
 * Represents a registered school in the system.
 * Schools are managed by admins and can have students, teachers, and classes
 * associated with them.
 */
import mongoose, { Document } from 'mongoose';
export interface ISchool extends Document {
    name: string;
    address: string;
    phone: string;
    email: string;
    principalName: string;
    establishedYear: number;
    website?: string;
    status: 'active' | 'inactive';
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const School: mongoose.Model<ISchool, {}, {}, {}, mongoose.Document<unknown, {}, ISchool, {}, {}> & ISchool & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default School;
//# sourceMappingURL=school.model.d.ts.map