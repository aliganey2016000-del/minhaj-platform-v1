/**
 * Exam Room Model
 * A physical hall/room used for exam room allocation. Belongs to an
 * organization (school) the same way Class/Course do.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IExamRoom extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  building: string;
  capacity: number;
  capacityMode: 'auto' | 'manual';
  school?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examRoomSchema = new Schema<IExamRoom>(
  {
    name: { type: String, required: [true, 'Room name is required'], trim: true, maxlength: 100 },
    building: { type: String, required: true, default: 'Main Campus', trim: true, maxlength: 100 },
    capacity: { type: Number, required: [true, 'Capacity is required'], min: [1, 'Capacity must be at least 1'] },
    // Auto capacity follows the largest active student count among classes
    // using this room. Admin edits/imports switch the room to manual mode so
    // the explicit capacity is preserved until the admin changes it again.
    capacityMode: { type: String, enum: ['auto', 'manual'], default: 'auto', index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

examRoomSchema.index({ school: 1, name: 1, building: 1 });

export default mongoose.model<IExamRoom>('ExamRoom', examRoomSchema);
