import assert from 'node:assert/strict';
import { offlineAttendancePeriod } from '../utils/offline-attendance-period';

function checkWeekly(input: string, start: string, end: string): void {
  const period = offlineAttendancePeriod(7, new Date(input));
  assert.equal(period.calendarAligned, true);
  assert.equal(period.start.toISOString(), new Date(start).toISOString());
  assert.equal(period.endExclusive.toISOString(), new Date(end).toISOString());
  assert.equal(period.nextPeriodStart.toISOString(), period.endExclusive.toISOString());
  assert.equal(period.endExclusive.getTime() - period.start.getTime(), 7 * 86400000);
}

// Teacher verified midweek must NOT receive another rolling seven days.
checkWeekly('2026-10-19T07:30:00+03:00', '2026-10-17T00:00:00+03:00', '2026-10-24T00:00:00+03:00');
// Friday evening is still in this period.
checkWeekly('2026-10-23T23:59:59+03:00', '2026-10-17T00:00:00+03:00', '2026-10-24T00:00:00+03:00');
// Saturday at midnight starts a NEW week; boundary is exclusive.
checkWeekly('2026-10-24T00:00:00+03:00', '2026-10-24T00:00:00+03:00', '2026-10-31T00:00:00+03:00');
// Sunday just after midnight and DST on user's phone have no influence.
checkWeekly('2026-10-25T00:01:00+03:00', '2026-10-24T00:00:00+03:00', '2026-10-31T00:00:00+03:00');
// Year rollover: last Saturday in 2026 -> first Saturday in 2027.
checkWeekly('2026-12-31T12:00:00+03:00', '2026-12-26T00:00:00+03:00', '2027-01-02T00:00:00+03:00');
checkWeekly('2027-01-02T00:00:00+03:00', '2027-01-02T00:00:00+03:00', '2027-01-09T00:00:00+03:00');
// Other admin policies are unchanged: rolling periods.
const at = new Date('2026-10-19T07:30:00+03:00');
for (const days of [1, 3, 14, 30]) {
  const period = offlineAttendancePeriod(days, at);
  assert.equal(period.calendarAligned, false);
  assert.equal(period.start.getTime(), at.getTime());
  assert.equal(period.endExclusive.getTime(), at.getTime() + days * 86400000);
}
console.log('PASS: Saturday-to-Saturday Somalia week; Fri/Sat boundary, month/year rollover, rolling nonweekly policies');
