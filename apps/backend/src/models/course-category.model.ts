/**
 * Course Category Model
 *
 * Per-organization course categories (Quran, Fiqh, English, ...). `slug` is
 * the stable key stored on Course.category — it never changes after
 * creation, even if the category is later renamed, so existing courses
 * never silently lose their category. `name` is the only thing renaming
 * touches.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface ICourseCategory extends Document {
  name: string;
  slug: string;
  school: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const courseCategorySchema = new Schema<ICourseCategory>(
  {
    name: { type: String, required: [true, 'Category name is required'], trim: true, maxlength: 60 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 },
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

courseCategorySchema.index({ school: 1, slug: 1 }, { unique: true });
courseCategorySchema.index({ school: 1, name: 1 }, { unique: true });

export default mongoose.model<ICourseCategory>('CourseCategory', courseCategorySchema);
