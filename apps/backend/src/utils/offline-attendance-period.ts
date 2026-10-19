/**
 * Teacher offline authorization periods.
 *
 * A seven-day policy is a *calendar week* (Saturday 00:00 inclusive to the
 * following Saturday 00:00 exclusive), not a rolling 168-hour token.
 * Somalia currently uses UTC+03:00 year-round; calculate using UTC calendar
 * methods to avoid the server container's own timezone.
 *
 * Reconnecting/online verification is still required for EACH new week.
 * This function never extends a local grant automatically.
 */
export const MOGADISHU_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OfflineAttendancePeriod {
  start: Date;
  endExclusive: Date;
  nextPeriodStart: Date;
  calendarAligned: boolean;
}

export function offlineAttendancePeriod(days: number, at = new Date()): OfflineAttendancePeriod {
  if (!Number.isFinite(at.getTime())) throw new Error('Invalid offline policy reference time');
  if (days === 7) {
    const localMs = at.getTime() + MOGADISHU_OFFSET_MS;
    const local = new Date(localMs);
    // JS: Sunday=0, Saturday=6. Distance back to most recent Saturday.
    const sinceSaturday = (local.getUTCDay() + 1) % 7;
    const thisSaturdayLocalMidnight = Date.UTC(
      local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - sinceSaturday,
    );
    const start = new Date(thisSaturdayLocalMidnight - MOGADISHU_OFFSET_MS);
    const endExclusive = new Date(start.getTime() + 7 * DAY_MS);
    return { start, endExclusive, nextPeriodStart: endExclusive, calendarAligned: true };
  }
  const start = new Date(at);
  const endExclusive = new Date(at.getTime() + days * DAY_MS);
  return { start, endExclusive, nextPeriodStart: endExclusive, calendarAligned: false };
}
