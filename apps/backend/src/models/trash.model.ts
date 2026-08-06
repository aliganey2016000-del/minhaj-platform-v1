/**
 * Trash — holds the full snapshot of anything soft-deleted app-wide, so it
 * can be restored later instead of being permanently gone the moment
 * someone clicks Delete. One Trash document represents ONE user-facing
 * delete action, which may itself have removed several related documents
 * (e.g. deleting a Parent also removes their User and Profile) — all of
 * those go in `snapshots` together so a restore can bring all of them
 * back in one shot. `restoreMeta` carries any extra bookkeeping a restore
 * needs beyond re-inserting the snapshots verbatim (e.g. which Students
 * had this Parent unlinked, so the link can be re-applied).
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface ITrashSnapshot {
  modelName: string;
  // Deliberately untyped — a snapshot mirrors whatever shape the source
  // model's document had at delete time (via `.toObject()`), which won't
  // structurally match a generic index signature.
  data: any;
}

export interface ITrash extends Document {
  entityType: 'Parent' | 'Teacher' | 'Class' | 'Course' | 'School';
  label: string;
  school?: mongoose.Types.ObjectId | null;
  snapshots: ITrashSnapshot[];
  restoreMeta?: Record<string, unknown>;
  deletedBy?: mongoose.Types.ObjectId | null;
  deletedByName?: string;
  deletedAt: Date;
}

const trashSchema = new Schema<ITrash>(
  {
    entityType: { type: String, required: true, enum: ['Parent', 'Teacher', 'Class', 'Course', 'School'], index: true },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    snapshots: [
      {
        _id: false,
        modelName: { type: String, required: true },
        data: { type: Schema.Types.Mixed, required: true },
      },
    ],
    restoreMeta: { type: Schema.Types.Mixed, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedByName: { type: String, default: '' },
    deletedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

const Trash = mongoose.model<ITrash>('Trash', trashSchema);
export default Trash;
