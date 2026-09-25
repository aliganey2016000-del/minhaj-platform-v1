import mongoose, { Document, Schema } from 'mongoose';

export interface IWebsiteMessage extends Document {
  school: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  sourcePage: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWebsiteMessage>({
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, trim: true, lowercase: true, maxlength: 180, default: '' },
  phone: { type: String, trim: true, maxlength: 60, default: '' },
  subject: { type: String, trim: true, maxlength: 180, default: 'Website enquiry' },
  message: { type: String, required: true, trim: true, maxlength: 6000 },
  status: { type: String, enum: ['new', 'read', 'replied', 'archived'], default: 'new', index: true },
  sourcePage: { type: String, trim: true, maxlength: 120, default: '/' },
}, { timestamps: true });

schema.index({ school: 1, createdAt: -1 });
export default mongoose.model<IWebsiteMessage>('WebsiteMessage', schema);
