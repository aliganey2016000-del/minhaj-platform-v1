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
