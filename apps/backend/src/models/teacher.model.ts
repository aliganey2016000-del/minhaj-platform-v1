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
    joiningDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive', 'on_leave'], default: 'active' },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

export default mongoose.model<ITeacher>('Teacher', teacherSchema);