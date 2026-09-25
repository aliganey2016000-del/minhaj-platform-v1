import mongoose, { Document, Schema } from 'mongoose';
import type { WebsiteSiteDocument } from './website-config.model';

export interface IWebsiteVersion extends Document {
  school: mongoose.Types.ObjectId;
  version: number;
  site: WebsiteSiteDocument;
  publishedBy: mongoose.Types.ObjectId;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWebsiteVersion>({
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  version: { type: Number, required: true, min: 1 },
  site: { type: Schema.Types.Mixed, required: true },
  publishedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, trim: true, maxlength: 300, default: '' },
}, { timestamps: true });

schema.index({ school: 1, version: -1 }, { unique: true });
export default mongoose.model<IWebsiteVersion>('WebsiteVersion', schema);
