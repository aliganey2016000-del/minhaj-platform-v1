/**
 * School-local "today" helpers.
 *
 * The backend container runs with the system/Node default timezone, which in
 * every deploy here is UTC (no TZ is set in the Dockerfile, and
 * node:22-alpine ships no zoneinfo for a local default other than UTC). This
 * platform's schools are all in Somalia (Africa/Mogadishu, UTC+3).
 *
 * `new Date(); d.setHours(0, 0, 0, 0)` truncates to the SERVER's current UTC
 * calendar day, not the school's local calendar day. Africa/Mogadishu is
 * *ahead* of UTC, so for the window 21:00-23:59:59 UTC the Mogadishu wall
 * clock has already rolled over to the next calendar day — any "is this
 * today?" check built on the server's UTC day boundary is then looking at
 * what the school considers *yesterday's* date and will wrongly treat a
 * same-day, school-local date as being in the future (or, symmetrically,
 * reject something as "too old" a day too early).
 *
 * Use `todaySchoolDateOnly()` instead of `new Date(); d.setHours(0,0,0,0)`
 * for any day-boundary check against a user-submitted, school-local
 * calendar date (payment dates, attendance dates, exam dates, invoice due
 * dates, etc).
 */

export const SCHOOL_TIMEZONE = process.env.APP_TIMEZONE || 'Africa/Mogadishu';

/** "YYYY-MM-DD" for `date` as it reads on a wall clock in `timezone`. */
export function dateOnlyLabelInTimezone(date: Date, timezone: string = SCHOOL_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * "Today" as a date-only `Date`, anchored to the school's local calendar day
 * rather than the server process's (UTC) calendar day. The returned value is
 * constructed the same way callers already parse a plain "YYYY-MM-DD"
 * user-submitted date (`new Date(\`${value}T00:00:00.000\`)`), so the two are
 * directly comparable with `<`, `>`, `<=`, `>=`.
 */
export function todaySchoolDateOnly(now: Date = new Date(), timezone: string = SCHOOL_TIMEZONE): Date {
  const label = dateOnlyLabelInTimezone(now, timezone);
  return new Date(`${label}T00:00:00.000`);
}

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

/**
 * The real instant at which a school-local wall-clock time happens, e.g.
 * ("2026-11-11", "08:00") -> 2026-11-11T05:00:00Z for Africa/Mogadishu.
 *
 * Exam dates are stored as a calendar day and start/end as "HH:MM" on the
 * school's clock. Building `new Date("2026-11-11T08:00")` instead reads the
 * time on the SERVER's clock (UTC), which opened an 08:00 exam at 11:00 in
 * Mogadishu. Returns null for malformed input.
 */
export function schoolWallTimeToDate(
  dateKey: string,
  time: string,
  timezone: string = SCHOOL_TIMEZONE,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));
  if (!dateMatch || !timeMatch) return null;
  const wallAsUtc = Date.UTC(
    Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]),
    Number(timeMatch[1]), Number(timeMatch[2]),
  );
  // Two passes so a zone whose offset changes near this instant (DST) still
  // resolves to the offset in force at the wall time itself.
  let instant = wallAsUtc - timezoneOffsetMs(new Date(wallAsUtc), timezone);
  const corrected = wallAsUtc - timezoneOffsetMs(new Date(instant), timezone);
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/** "YYYY-MM-DD" calendar day an exam's stored `examDate` represents (stored as UTC midnight). */
export function examDateKeyOf(examDate: Date | string | undefined | null): string {
  if (!examDate) return '';
  const date = new Date(examDate);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
