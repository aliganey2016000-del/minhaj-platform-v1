import mongoose, { Document, Schema } from 'mongoose';

export interface IWhatsAppTemplate extends Document {
  organization: mongoose.Types.ObjectId;
  name: string;
  languageCode: string;
  body: string;
  variables: string[];
  active: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWhatsAppTemplate>({
  organization: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  name: { type: String, required: true, trim: true },
  languageCode: { type: String, required: true, trim: true, default: 'en_US' },
  body: { type: String, required: true, trim: true },
  variables: { type: [String], default: [] },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
}, { timestamps: true });

schema.index({ organization: 1, name: 1 }, { unique: true });

export default mongoose.model<IWhatsAppTemplate>('WhatsAppTemplate', schema);
