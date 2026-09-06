import mongoose, { Schema, Document } from 'mongoose';

export interface IFaculty extends Document {
  name: string;
  code?: string;
  tenantId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const facultySchema = new Schema<IFaculty>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, trim: true, maxlength: 30, default: '' },
    tenantId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

facultySchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<IFaculty>('Faculty', facultySchema);
