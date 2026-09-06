import mongoose, { Schema, Document } from 'mongoose';

export interface IFaculty extends Document {
  name: string;
  code?: string;
  deanName?: string;
  phone?: string;
  email?: string;
  establishedYear?: number;
  tenantId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const facultySchema = new Schema<IFaculty>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, trim: true, maxlength: 30, default: '' },
    deanName: { type: String, trim: true, maxlength: 100, default: '' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
    establishedYear: { type: Number, min: 1900, max: new Date().getFullYear(), default: null },
    tenantId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

facultySchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<IFaculty>('Faculty', facultySchema);
