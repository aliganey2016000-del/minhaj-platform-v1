import mongoose, { Schema, Document } from 'mongoose';

export interface IDepartment extends Document {
  name: string;
  code?: string;
  headOfDepartment?: string;
  phone?: string;
  email?: string;
  establishedYear?: number;
  tenantId: mongoose.Types.ObjectId;
  facultyId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartment>(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      maxlength: [100, 'Department name cannot exceed 100 characters'],
    },
    code: {
      type: String,
      trim: true,
      maxlength: [20, 'Department code cannot exceed 20 characters'],
      default: '',
    },
    headOfDepartment: {
      type: String,
      trim: true,
      maxlength: [100, 'Head of department name cannot exceed 100 characters'],
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, 'Phone cannot exceed 30 characters'],
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [200, 'Email cannot exceed 200 characters'],
      default: '',
    },
    establishedYear: {
      type: Number,
      min: [1900, 'Year must be 1900 or later'],
      max: [new Date().getFullYear(), 'Year cannot be in the future'],
      default: null,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    facultyId: {
      type: Schema.Types.ObjectId,
      ref: 'Faculty',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

departmentSchema.index({ tenantId: 1, name: 1 }, { unique: true });
departmentSchema.index({ tenantId: 1, facultyId: 1, name: 1 });

const Department = mongoose.model<IDepartment>('Department', departmentSchema);
export default Department;
