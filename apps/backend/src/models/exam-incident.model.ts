/**
 * Exam Incident Model
 * Logs exam violations, cheating reports, disruptions, technical issues, or
 * special accommodations for "Compliances & Issues".
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IExamIncident extends Document {
  _id: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  student?: mongoose.Types.ObjectId;
  type: 'cheating' | 'disruption' | 'technical_issue' | 'accommodation' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
  status: 'open' | 'resolved' | 'dismissed';
  reportedBy: mongoose.Types.ObjectId;
  resolutionNotes?: string;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  school?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examIncidentSchema = new Schema<IExamIncident>(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    type: {
      type: String,
      enum: ['cheating', 'disruption', 'technical_issue', 'accommodation', 'other'],
      required: true,
    },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    description: { type: String, required: [true, 'Description is required'], maxlength: 2000 },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open', index: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resolutionNotes: { type: String, default: '' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

export default mongoose.model<IExamIncident>('ExamIncident', examIncidentSchema);
