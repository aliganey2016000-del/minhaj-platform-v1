/**
 * ClassSchedule Model
 *
 * Dedicated scheduling model linking an organization, class, course, and
 * optional teacher to a specific day-of-week and time window.
 *
 * Used to determine whether a teacher's "Take Attendance" action is
 * time-locked (only enabled during the scheduled window on the correct day)
 * and to display read-only schedules to students.
 */

import mongoose, { Schema, Document } from 'mongoose';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export function dayName(day: number): string {
  return DAY_NAMES[day] || 'Unknown';
}

export interface IClassSchedule extends Document {
  _id: mongoose.Types.ObjectId;
  school: mongoose.Types.ObjectId;
  class: mongoose.Types.ObjectId;
  /** ObjectId when stored; populated Course document in populated queries. */
  course: any;
  teacher?: mongoose.Types.ObjectId | null;
  /** Optional schedule-specific room. Existing rows may leave this blank and
   * the timetable checker will fall back to the Class.room value. */
  room?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const classScheduleSchema = new Schema<IClassSchedule>(
  {
    school: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'Organization is required'],
      index: true,
    },
    class: {
      type: Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course is required'],
      index: true,
    },
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null,
      index: true,
    },
    room: {
      type: String,
      trim: true,
      maxlength: [80, 'Room cannot exceed 80 characters'],
      default: '',
      index: true,
    },
    dayOfWeek: {
      type: Number,
      required: [true, 'Day of week is required'],
      min: [0, 'Day must be 0 (Sunday) through 6 (Saturday)'],
      max: [6, 'Day must be 0 (Sunday) through 6 (Saturday)'],
      index: true,
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be HH:MM (24-hour format)'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be HH:MM (24-hour format)'],
      validate: {
        validator(this: IClassSchedule, value: string): boolean {
          if (!this.startTime) return true;
          return value > this.startTime;
        },
        message: 'End time must be after start time',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

classScheduleSchema.index({ school: 1, isActive: 1 });
classScheduleSchema.index({ course: 1, dayOfWeek: 1 });
classScheduleSchema.index({ school: 1, class: 1, dayOfWeek: 1, startTime: 1, endTime: 1 });
classScheduleSchema.index({ school: 1, teacher: 1, dayOfWeek: 1, startTime: 1, endTime: 1 });
classScheduleSchema.index({ school: 1, room: 1, dayOfWeek: 1, startTime: 1, endTime: 1 });

export interface ScheduleStatus {
  isScheduled: boolean;
  isWithinWindow: boolean;
  schedule: {
    dayOfWeek: DayOfWeek;
    dayName: string;
    startTime: string;
    endTime: string;
  } | null;
}

export async function getCourseScheduleStatus(
  courseId: string,
  timezoneOffset: number = 3
): Promise<ScheduleStatus> {
  const now = new Date();
  const offsetMs = timezoneOffset * 60 * 60 * 1000;
  const localDate = new Date(now.getTime() + offsetMs);

  const dayOfWeek = localDate.getUTCDay() as DayOfWeek;
  const timeStr = localDate.toISOString().slice(11, 16);

  const schedules = await mongoose
    .model<IClassSchedule>('ClassSchedule')
    .find({ course: courseId, dayOfWeek, isActive: true })
    .select('dayOfWeek startTime endTime')
    .lean();

  if (schedules.length === 0) {
    return { isScheduled: false, isWithinWindow: false, schedule: null };
  }

  let matchingSchedule: typeof schedules[0] | null = null;
  for (const s of schedules) {
    if (timeStr >= s.startTime && timeStr < s.endTime) {
      matchingSchedule = s;
      break;
    }
  }

  const schedule = schedules[0];
  return {
    isScheduled: true,
    isWithinWindow: !!matchingSchedule,
    schedule: {
      dayOfWeek: schedule.dayOfWeek as DayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    },
  };
}

const ClassSchedule = mongoose.model<IClassSchedule>('ClassSchedule', classScheduleSchema);
export default ClassSchedule;
