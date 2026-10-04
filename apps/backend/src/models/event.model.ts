import mongoose, { Schema, Document } from 'mongoose';

export interface IEvent extends Document {
  title: string;
  description: string;
  eventDate: Date;
  startTime?: string;
  endTime?: string;
  location?: string;
  image?: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  createdBy: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IEvent>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    eventDate: { type: Date, required: true },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    location: { type: String, default: '' },
    image: { type: String, default: '' },
    status: { type: String, enum: ['upcoming', 'ongoing', 'completed', 'cancelled'], default: 'upcoming', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Owning school. null = platform-wide content only the platform admin manages.
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  },
  { timestamps: true, toJSON: { transform(_d: any, r: any) { delete r.__v; return r; } } }
);

schema.index({ eventDate: 1 });
// GET / (content.controller.ts getAll, shared by Announcement/News/Event/
// Gallery) filters by {school, status?} and always sorts by createdAt desc
// for pagination. See announcement.model.ts for the same gap.
schema.index({ school: 1, status: 1, createdAt: -1 });

export default mongoose.model<IEvent>('Event', schema);