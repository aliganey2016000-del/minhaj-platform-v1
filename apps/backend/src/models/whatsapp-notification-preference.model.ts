import mongoose, { Document, Schema } from 'mongoose';

export type WhatsAppNotificationCategory =
  | 'attendance'
  | 'fees'
  | 'results'
  | 'assignments'
  | 'exams'
  | 'announcements'
  | 'general';

export interface IWhatsAppNotificationPreference extends Document {
  organizationId: mongoose.Types.ObjectId;
  parentId: mongoose.Types.ObjectId;
  category: WhatsAppNotificationCategory;
  enabled: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

const schema = new Schema<IWhatsAppNotificationPreference>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },
  category: {
    type: String,
    enum: ['attendance', 'fees', 'results', 'assignments', 'exams', 'announcements', 'general'],
    required: true,
  },
  enabled: { type: Boolean, default: true },
  quietHoursStart: { type: String, default: null },
  quietHoursEnd: { type: String, default: null },
}, { timestamps: true });

schema.index({ organizationId: 1, parentId: 1, category: 1 }, { unique: true });

export const WhatsAppNotificationPreference = mongoose.model<IWhatsAppNotificationPreference>('WhatsAppNotificationPreference', schema);
