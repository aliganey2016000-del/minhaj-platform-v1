/**
 * Sidebar Setting Model
 * Per-organization show/hide overrides for a portal's sidebar items.
 * One document per (school, portal):
 *   - portal 'student': the student portal sidebar — editable by org_admin
 *     (own org only) or admin (any org, via the Tenant Sidebar Config page).
 *   - portal 'teacher': the teacher portal sidebar — editable by the org_admin\n *     for its own school (or platform admin for a selected school).\n *   - portal 'admin': the org-admin/staff admin-portal visibility layer —
 *     editable by admin (super admin) ONLY, via the Org Admin Sidebar
 *     Manager page. org_admin/teacher can read their own org's setting to
 *     filter their own nav, but never edit it themselves.
 * An item with no override is visible by default.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface ISidebarItemOverride {
  key: string;
  visible: boolean;
}

export interface ISidebarSetting extends Document {
  _id: mongoose.Types.ObjectId;
  school: mongoose.Types.ObjectId;
  portal: 'student' | 'teacher' | 'admin';
  items: ISidebarItemOverride[];
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const sidebarItemOverrideSchema = new Schema<ISidebarItemOverride>(
  {
    key: { type: String, required: true, trim: true },
    visible: { type: Boolean, required: true, default: true },
  },
  { _id: false }
);

const sidebarSettingSchema = new Schema<ISidebarSetting>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    portal: { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
    items: { type: [sidebarItemOverrideSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

sidebarSettingSchema.index({ school: 1, portal: 1 }, { unique: true });

export default mongoose.model<ISidebarSetting>('SidebarSetting', sidebarSettingSchema);
