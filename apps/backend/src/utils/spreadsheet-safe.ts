/**
 * Spreadsheet formula-injection guard for exports.
 *
 * A cell whose text starts with =, +, - or @ (or a tab/CR) is run as a
 * formula when an administrator opens the exported CSV/XLSX in Excel or
 * Sheets. Names, room names, titles and similar text come from students and
 * teachers, so an export must never hand them to a spreadsheet unchanged.
 * Such text gets a leading apostrophe, which spreadsheets show as plain text.
 * Numbers, dates and number-like text (phone numbers such as +252 61 000 0000,
 * -5, 12%) are left alone because they are not formulas.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const NUMBER_LIKE = /^[+-]?[\d\s().,-]+%?$/;

export function safeCell<T>(value: T): T | string {
  if (typeof value !== 'string' || !FORMULA_START.test(value)) return value;
  if (NUMBER_LIKE.test(value)) return value;
  return `'${value}`;
}

export function safeRow<T>(row: readonly T[]): Array<T | string> {
  return row.map(safeCell);
}

export function safeRows<T>(rows: ReadonlyArray<readonly T[]>): Array<Array<T | string>> {
  return rows.map(safeRow);
}

export function safeRecord<T extends Record<string, unknown>>(record: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) out[key] = safeCell(value);
  return out as T;
}
