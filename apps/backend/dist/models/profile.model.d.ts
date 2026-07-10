/**
 * Profile Model
 * Stores extended personal information for all user types.
 * One-to-one relationship with the User model.
 */
import mongoose, { Document } from 'mongoose';
export interface IAddress {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
}
export interface IEmergencyContact {
    name?: string;
    phone?: string;
    relationship?: string;
}
export interface IProfile extends Document {
    _id: mongoose.Types.ObjectId;
    user: mongoose.Types.ObjectId;
    firstName: string;
    lastName: string;
    gender: 'male' | 'female';
    dateOfBirth?: Date;
    avatar?: string;
    address?: IAddress;
    emergencyContact?: IEmergencyContact;
    createdAt: Date;
    updatedAt: Date;
}
declare const Profile: mongoose.Model<IProfile, {}, {}, {}, mongoose.Document<unknown, {}, IProfile, {}, {}> & IProfile & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default Profile;
//# sourceMappingURL=profile.model.d.ts.map