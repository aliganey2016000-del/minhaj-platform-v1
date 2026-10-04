import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnouncement extends Document {
  title: string;
  content: string;
  audience: 'all' | 'students' | 'parents' | 'teachers';
  isPinned: boolean;
  status: 'active' | 'inactive';
  createdBy: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, maxlength: 5000 },
    audience: { type: String, enum: ['all', 'students', 'parents', 'teachers'], default: 'all', index: true },
    isPinned: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Owning school. null = platform-wide content only the platform admin manages.
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  },
  { timestamps: true, toJSON: { transform(_d: any, r: any) { delete r.__v; return r; } } }
);

// GET / (content.controller.ts getAll, shared by Announcement/News/Event/
// Gallery) filters by {school, status?} and always sorts by createdAt desc
// for pagination. `school` and `status` only had separate single-field
// indexes, so Mongo could use at most one of them for the filter and still
// had to sort the matched set in memory on every page.
announcementSchema.index({ school: 1, status: 1, createdAt: -1 });

export default mongoose.model<IAnnouncement>('Announcement', announcementSchema);