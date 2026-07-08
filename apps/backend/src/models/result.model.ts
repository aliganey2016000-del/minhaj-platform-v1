import mongoose, { Schema, Document } from 'mongoose';

export interface IResult extends Document {
  exam: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  remarks: string;
  status: 'passed' | 'failed' | 'absent';
  enteredBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const resultSchema = new Schema<IResult>(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    marksObtained: { type: Number, required: true, min: 0 },
    totalMarks: { type: Number, required: true, min: 1 },
    percentage: { type: Number, default: 0 },
    grade: { type: String, default: 'F', maxlength: 5 },
    remarks: { type: String, default: '' },
    status: { type: String, enum: ['passed', 'failed', 'absent'], default: 'failed', index: true },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

resultSchema.index({ exam: 1, student: 1 }, { unique: true });
resultSchema.index({ student: 1 });
resultSchema.index({ status: 1 });

// Auto-calculate percentage and grade
resultSchema.pre<IResult>('save', function (next) {
  if (this.totalMarks > 0) {
    this.percentage = Math.round((this.marksObtained / this.totalMarks) * 100);
  }

  if (this.status === 'absent') {
    this.marksObtained = 0;
    this.percentage = 0;
    this.grade = 'N/A';
  } else {
    const p = this.percentage;
    if (p >= 90) this.grade = 'A+';
    else if (p >= 80) this.grade = 'A';
    else if (p >= 70) this.grade = 'B';
    else if (p >= 60) this.grade = 'C';
    else if (p >= 50) this.grade = 'D';
    else this.grade = 'F';
  }

  if (this.status !== 'absent') {
    const passThreshold = 50; // 50% default passing mark
    this.status = this.percentage >= passThreshold ? 'passed' : 'failed';
  }

  next();
});

export default mongoose.model<IResult>('Result', resultSchema);