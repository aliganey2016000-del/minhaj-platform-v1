import mongoose from 'mongoose';
import ClassSchedule from '../models/class-schedule.model';
import AttendanceSession from '../models/attendance-session.model';
import Teacher from '../models/teacher.model';
import { claimOnce } from '../utils/reminder-lock';
import { sendPushToUser, isPushConfigured } from '../utils/web-push';

const TIME_ZONE = process.env.APP_TIMEZONE || 'Africa/Mogadishu';
const REMINDER_MINUTES = 15;
let running = false;

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    dayOfWeek: weekdays[values.weekday] ?? -1,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function addMinutesToClock(hour: number, minute: number, amount: number) {
  const total = hour * 60 + minute + amount;
  return {
    time: `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`,
    dayOffset: Math.floor(total / 1440),
  };
}

/**
 * Sends one push reminder at the 15-minute mark for each active lesson if
 * the teacher has not completed attendance. Runs on the backend, so it does
 * not depend on the teacher keeping the PWA open.
 */
export async function sendAttendanceVoiceReminders(now = new Date()): Promise<void> {
  if (running || !isPushConfigured()) return;
  running = true;
  try {
    const local = localParts(now);
    const target = addMinutesToClock(local.hour, local.minute, REMINDER_MINUTES);
    // A reminder must not accidentally match tomorrow's lesson when the
    // +15-minute calculation crosses midnight.
    if (target.dayOffset !== 0) return;

    const schedules = await ClassSchedule.find({
      isActive: true,
      dayOfWeek: local.dayOfWeek,
      endTime: target.time,
      teacher: { $ne: null },
    }).select('_id school teacher class course endTime').lean();

    if (!schedules.length) return;

    // Store the class date as the midnight at the configured timezone offset.
    // APP_TIMEZONE defaults to Africa/Mogadishu (UTC+3).
    const dayStart = new Date(`${local.dateKey}T00:00:00+03:00`);
    const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    for (const schedule of schedules) {
      const scheduleId = String(schedule._id);
      const schoolId = String(schedule.school);
      const completeSession = await AttendanceSession.exists({
        school: schedule.school,
        schedule: schedule._id,
        date: { $gte: dayStart, $lt: nextDay },
        status: 'complete',
      });
      if (completeSession) continue;

      const teacher = await Teacher.findById(schedule.teacher).select('user status').lean() as
        | { user?: mongoose.Types.ObjectId; status?: string }
        | null;
      if (!teacher?.user || teacher.status === 'inactive' || teacher.status === 'on_leave') continue;

      const claimKey = `attendance-voice-reminder:${schoolId}:${scheduleId}:${local.dateKey}`;
      if (!(await claimOnce(claimKey))) continue;

      await sendPushToUser(String(teacher.user), {
        title: 'Attendance reminder | Xusuusin xaadirinta',
        message: `Your class ends in 15 minutes. Please submit attendance now. Casharku wuxuu dhammaanayaa 15 daqiiqo kadib; fadlan xaadirinta gudbi.`,
        link: '/teacher/attendance',
      });
    }
  } finally {
    running = false;
  }
}
