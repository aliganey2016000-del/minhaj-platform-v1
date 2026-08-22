import mongoose, { Schema, Document } from 'mongoose';

export interface ITeacher extends Document {
  user: mongoose.Types.ObjectId;
  profile: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  teacherId: string;
  qualification?: string;
  specialization?: string[];
  experience?: number;
  bio?: string;
  courses: mongoose.Types.ObjectId[];
  /** Per-course permission: COURSE_BUILDER = full edit, STUDENT_VIEW = read-only */
  coursePermission: 'COURSE_BUILDER' | 'STUDENT_VIEW';
  joiningDate: Date;
  status: 'active' | 'inactive' | 'on_leave';
}

const teacherSchema = new Schema<ITeacher>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    profile: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: undefined },
    teacherId: { type: String, unique: true, sparse: true },
    qualification: { type: String, default: '' },
    specialization: [{ type: String }],
    experience: { type: Number, default: 0 },
    bio: { type: String, default: '' },
    courses: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    coursePermission: {
      type: String,
      enum: ['COURSE_BUILDER', 'STUDENT_VIEW'],
      default: 'COURSE_BUILDER',
    },
    joiningDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive', 'on_leave'], default: 'active' },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

// Teacher IDs are generated in several places (manual create, bulk import,
// etc.). A simple count-based generator can reuse an existing ID after
// deletions or partial imports. Before saving a new teacher, ensure the
// proposed ID is unique and move it to the next free number when necessary.
teacherSchema.pre('save', async function (next) {
  if (!this.isNew || !this.teacherId) return next();

  const TeacherModel = this.constructor as mongoose.Model<ITeacher>;
  const existing = await TeacherModel.exists({ teacherId: this.teacherId, _id: { $ne: this._id } });
  if (!existing) return next();

  const match = this.teacherId.match(/^TCH-(\d{4})-(\d+)$/);
  const year = match?.[1] || String(new Date().getFullYear());
  let nextNumber = match ? parseInt(match[2], 10) + 1 : 1;

  while (await TeacherModel.exists({ teacherId: `TCH-${year}-${String(nextNumber).padStart(4, '0')}` })) {
    nextNumber += 1;
  }

  this.teacherId = `TCH-${year}-${String(nextNumber).padStart(4, '0')}`;
  next();
});

export default mongoose.model<ITeacher>('Teacher', teacherSchema);