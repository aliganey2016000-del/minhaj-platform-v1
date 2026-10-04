/** Format a browser-local calendar date for date inputs and date-only API fields. */
export function localCalendarDate(date: Date): string {
  // toISOString() converts to UTC and can change the calendar day.
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
