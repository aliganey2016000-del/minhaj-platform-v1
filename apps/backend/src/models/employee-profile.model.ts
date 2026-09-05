import mongoose, { Document, Schema } from 'mongoose';

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary' | 'intern';
export type EmploymentStatus = 'hired' | 'active' | 'on_leave' | 'suspended' | 'resigned' | 'terminated' | 'archived';

export interface IEmployeeProfile extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  employeeId: string;
  dateOfBirth?: Date | null;
  identityNumber?: string;
  address?: { street?: string; city?: string; state?: string; country?: string; zip?: string };
  emergencyContact?: { name?: string; phone?: string; relationship?: string };
  qualification?: string;
  specialization?: string;
  joiningDate?: Date | null;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const employeeProfileSchema = new Schema<IEmployeeProfile>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    employeeId: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, default: null },
    identityNumber: { type: String, trim: true, maxlength: 100, default: '' },
    address: {
      street: { type: String, default: '' }, city: { type: String, default: '' },
      state: { type: String, default: '' }, country: { type: String, default: '' }, zip: { type: String, default: '' },
    },
    emergencyContact: {
      name: { type: String, default: '' }, phone: { type: String, default: '' }, relationship: { type: String, default: '' },
    },
    qualification: { type: String, trim: true, maxlength: 200, default: '' },
    specialization: { type: String, trim: true, maxlength: 200, default: '' },
    joiningDate: { type: Date, default: null },
    employmentType: { type: String, enum: ['full_time', 'part_time', 'contract', 'temporary', 'intern'], default: 'full_time' },
    employmentStatus: { type: String, enum: ['hired', 'active', 'on_leave', 'suspended', 'resigned', 'terminated', 'archived'], default: 'active' },
    notes: { type: String, maxlength: 2000, default: '' },
  },
  { timestamps: true }
);

employeeProfileSchema.index({ organizationId: 1, employeeId: 1 }, { unique: true });

const EmployeeProfile = mongoose.model<IEmployeeProfile>('EmployeeProfile', employeeProfileSchema);
export default EmployeeProfile;
