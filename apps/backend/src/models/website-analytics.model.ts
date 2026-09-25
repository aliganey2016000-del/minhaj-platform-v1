import mongoose, { Document, Schema } from 'mongoose';

export interface IWebsiteAnalyticsDaily extends Document {
  school: mongoose.Types.ObjectId;
  date: string;
  page: string;
  views: number;
  ctaClicks: number;
  contactSubmissions: number;
  visitorHashes: string[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWebsiteAnalyticsDaily>({
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  page: { type: String, required: true, trim: true, maxlength: 120, default: '/' },
  views: { type: Number, default: 0, min: 0 },
  ctaClicks: { type: Number, default: 0, min: 0 },
  contactSubmissions: { type: Number, default: 0, min: 0 },
  visitorHashes: { type: [String], default: [] },
}, { timestamps: true });

schema.index({ school: 1, date: 1, page: 1 }, { unique: true });
export default mongoose.model<IWebsiteAnalyticsDaily>('WebsiteAnalyticsDaily', schema);
