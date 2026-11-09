/**
 * School-local exam times.
 *
 * Exams are stored as a calendar day plus "HH:MM" start/end on the school's
 * clock (Africa/Mogadishu). `new Date("2026-11-11T08:00")` reads that time on
 * the viewer's device clock instead, so a phone or laptop set to another zone
 * would show an exam as live at the wrong time. These helpers resolve the
 * real instant in the school's zone — the same rule the backend uses to open
 * and close exams (apps/backend/src/utils/school-date.ts).
 */

export const SCHOOL_TIMEZONE = 'Africa/Mogadishu';

/** How far `timezone`'s wall clock is ahead of UTC at `date`, in ms. */
function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
  const asUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" calendar day an exam's stored date represents (stored as UTC midnight). */
export function examDayKey(value: string | Date | undefined | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/**
 * The instant a school-local wall-clock time happens, e.g.
 * ("2026-11-11", "08:00") -> 2026-11-11T05:00:00Z. Accepts "HH:MM" or
 * "HH:MM:SS". Returns null for malformed input.
 */
export function schoolWallTimeToDate(
  dateKey: string,
  time: string,
  timezone: string = SCHOOL_TIMEZONE,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(String(time || ''));
  if (!dateMatch || !timeMatch) return null;
  const wallAsUtc = Date.UTC(
    Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]),
    Number(timeMatch[1]), Number(timeMatch[2]),
  );
  let instant = wallAsUtc - timezoneOffsetMs(new Date(wallAsUtc), timezone);
  const corrected = wallAsUtc - timezoneOffsetMs(new Date(instant), timezone);
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/** Start/end instants of a fixed exam window, or null when it has no usable schedule. */
export function examWindow(
  examDate: string | Date | undefined | null,
  startTime: string | undefined | null,
  endTime: string | undefined | null,
): { start: Date; end: Date } | null {
  const day = examDayKey(examDate);
  const start = schoolWallTimeToDate(day, String(startTime || ''));
  const end = schoolWallTimeToDate(day, String(endTime || ''));
  return start && end ? { start, end } : null;
}
