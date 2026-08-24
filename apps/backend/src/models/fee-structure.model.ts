import mongoose, { Schema, Document } from 'mongoose';

export interface IFeeStructureComponent {
  description: string;
  amount: number;
}

export interface IFeeStructure extends Document {
  school: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  feeType: 'tuition' | 'registration' | 'exam' | 'material' | 'transport' | 'library' | 'activity' | 'uniform' | 'other';
  scopeType: 'school' | 'department' | 'class';
  scopeRefModel?: 'Department' | 'Class';
  scopeRef?: mongoose.Types.ObjectId;
  amount: number;
  components: IFeeStructureComponent[];
  billingCycle: 'one_time' | 'monthly' | 'termly' | 'annual';
  academicYear?: string;
  dueDayOffset: number;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const componentSchema = new Schema<IFeeStructureComponent>(
  {
    description: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const feeStructureSchema = new Schema<IFeeStructure>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    feeType: {
      type: String,
      enum: ['tuition', 'registration', 'exam', 'material', 'transport', 'library', 'activity', 'uniform', 'other'],
      default: 'tuition',
    },
    scopeType: { type: String, enum: ['school', 'department', 'class'], required: true, default: 'school', index: true },
    scopeRefModel: { type: String, enum: ['Department', 'Class'], default: null },
    scopeRef: { type: Schema.Types.ObjectId, refPath: 'scopeRefModel', default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    components: { type: [componentSchema], default: [] },
    billingCycle: { type: String, enum: ['one_time', 'monthly', 'termly', 'annual'], required: true, default: 'one_time' },
    academicYear: { type: String, trim: true, maxlength: 20, default: '' },
    dueDayOffset: { type: Number, min: 0, max: 180, default: 14 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

// When components are supplied, the structure's total `amount` is the sum of
// its components — a single source of truth so invoice generation and list
// views always agree with the line items.
feeStructureSchema.pre<IFeeStructure>('validate', function (next) {
  if (this.components && this.components.length > 0) {
    this.amount = this.components.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }
  next();
});

// scopeRef/scopeRefModel are only meaningful below school-wide scope — keep
// them in sync with scopeType so a stale scopeRef never survives an edit
// that widens a structure back out to school-wide.
feeStructureSchema.pre<IFeeStructure>('validate', function (next) {
  if (this.scopeType === 'school') {
    this.scopeRef = undefined;
    this.scopeRefModel = undefined;
  } else if (this.scopeType === 'department') {
    this.scopeRefModel = 'Department';
  } else if (this.scopeType === 'class') {
    this.scopeRefModel = 'Class';
  }
  if (this.scopeType !== 'school' && !this.scopeRef) {
    return next(new Error(`scopeRef is required when scopeType is "${this.scopeType}"`));
  }
  next();
});

feeStructureSchema.index({ school: 1, isActive: 1 });
feeStructureSchema.index({ school: 1, scopeType: 1, scopeRef: 1 });

export default mongoose.model<IFeeStructure>('FeeStructure', feeStructureSchema);
