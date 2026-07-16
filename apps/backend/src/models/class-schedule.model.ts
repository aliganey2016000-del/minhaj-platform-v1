/**
 * ClassSchedule Model
 *
 * Dedicated scheduling model linking an organization, class, course, and
 * teacher to a specific day-of-week and time window.
 *
 * Used to determine whether a teacher's "Take Attendance" action is
 * time-locked (only enabled during the scheduled window on the correct day)
 * and to display read-only schedules to students.
 */

import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday … 6=Saturday

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
  course: mongoose.Types.ObjectId;
  teacher: mongoose.Types.ObjectId;
  dayOfWeek: DayOfWeek;
  startTime: string; // HH:MM (24h)
  endTime: string; // HH:MM (24h)
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

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
      required: [true, 'Teacher is required'],
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
          if (!this.startTime) return true; // let required validator handle it
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

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
classScheduleSchema.index({ school: 1, isActive: 1 });
classScheduleSchema.index({ course: 1, dayOfWeek: 1 });

// ---------------------------------------------------------------------------
// Static: Check if a course is currently within its scheduled window
// ---------------------------------------------------------------------------

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

/**
 * Checks whether a given course is scheduled right now.
 * Returns the schedule status including whether the current time
 * falls within an active schedule window for this course.
 */
export async function getCourseScheduleStatus(
  courseId: string,
  timezoneOffset: number = 3 // UTC+3 default (East Africa / Mogadishu)
): Promise<ScheduleStatus> {
  const now = new Date();
  const offsetMs = timezoneOffset * 60 * 60 * 1000;
  const localDate = new Date(now.getTime() + offsetMs);

  const dayOfWeek = localDate.getUTCDay() as DayOfWeek;
  const timeStr = localDate.toISOString().slice(11, 16); // HH:MM in UTC

  // Get all active schedules for today
  const schedules = await mongoose
    .model<IClassSchedule>('ClassSchedule')
    .find({
      course: courseId,
      dayOfWeek,
      isActive: true,
    })
    .select('dayOfWeek startTime endTime')
    .lean();

  if (schedules.length === 0) {
    return { isScheduled: false, isWithinWindow: false, schedule: null };
  }

  // Check if current time falls within any schedule window
  let matchingSchedule: typeof schedules[0] | null = null;

  for (const s of schedules) {
    // In production the timezone-adjusted time needs comparison against
    // the schedule times — here we use the UTC time of the offset-adjusted
    // date since the schedule times are stored without tz info (they are
    // "local" to the organization's timezone).
    if (timeStr >= s.startTime && timeStr < s.endTime) {
      matchingSchedule = s;
      break;
    }
  }

  const schedule = schedules[0]; // use first for display even if not within window

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

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const ClassSchedule = mongoose.model<IClassSchedule>(
  'ClassSchedule',
  classScheduleSchema
);

export default ClassSchedule;