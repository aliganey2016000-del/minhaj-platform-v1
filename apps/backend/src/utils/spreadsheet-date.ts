import * as XLSX from 'xlsx';

// Excel stores dates as day counts ("serials"). A five-digit serial covers
// 1927–2173, which is every date a school record can plausibly carry.
const SERIAL_TEXT = /^\d{5}(\.\d+)?$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 9999;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

export function excelSerialToDate(serial: number): Date | undefined {
  const parts = XLSX.SSF.parse_date_code(serial);
  if (!parts) return undefined;
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function inSupportedRange(date: Date): boolean {
  const year = date.getUTCFullYear();
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * Parses a date cell from an uploaded spreadsheet or CSV.
 *
 * `new Date("46037")` reads an Excel serial as the *year* 46037, which
 * MongoDB's $dateToString cannot render and which crashed the student and
 * dashboard statistics. Numeric cells and five-digit numeric text are
 * therefore treated as serials, and anything outside years 1900–9999 is
 * rejected instead of stored.
 */
export function parseSpreadsheetDate(raw: unknown): Date | undefined {
  if (raw === null || raw === undefined || clean(raw) === '') return undefined;
  let date: Date | undefined;
  if (raw instanceof Date) date = raw;
  else if (typeof raw === 'number') date = excelSerialToDate(raw);
  else if (SERIAL_TEXT.test(clean(raw))) date = excelSerialToDate(Number(clean(raw)));
  else date = new Date(clean(raw));
  return date && !Number.isNaN(date.getTime()) && inSupportedRange(date) ? date : undefined;
}

/**
 * Recovers the real date from a value that was stored after an Excel serial
 * was parsed as a year (serial 46037 -> 1 Jan 46037 -> 15 Jan 2026).
 *
 * Only values sitting on 1 January of their year qualify, because that is the
 * only shape the bad parse produces. The +14h shift tolerates the server's
 * time zone at the moment of the bad parse (UTC-12 .. UTC+14).
 */
export function recoverSerialParsedAsYear(value: Date, earliest: Date, latest: Date): Date | undefined {
  const shifted = new Date(value.getTime() + 14 * 60 * 60 * 1000);
  if (shifted.getUTCMonth() !== 0 || shifted.getUTCDate() > 2) return undefined;
  const recovered = excelSerialToDate(shifted.getUTCFullYear());
  if (!recovered || recovered < earliest || recovered > latest) return undefined;
  return recovered;
}
