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
  allocationEnabled: boolean;
  school?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examRoomSchema = new Schema<IExamRoom>(
  {
    name: { type: String, required: [true, 'Room name is required'], trim: true, maxlength: 100 },
    building: { type: String, required: true, default: 'Main', trim: true, maxlength: 100 },
    capacity: { type: Number, required: [true, 'Capacity is required'], min: [1, 'Capacity must be at least 1'] },
    // Rooms are explicit organization-owned records. "auto" remains only for
    // legacy class-sync rows so they can be excluded from the current registry.
    capacityMode: { type: String, enum: ['auto', 'manual'], default: 'manual', index: true },
    allocationEnabled: { type: Boolean, default: true, index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

examRoomSchema.index({ school: 1, name: 1, building: 1 });

export default mongoose.model<IExamRoom>('ExamRoom', examRoomSchema);
