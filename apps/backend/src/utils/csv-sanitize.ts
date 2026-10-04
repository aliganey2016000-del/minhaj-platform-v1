/**
 * Guards against CSV/formula injection (a.k.a. "CSV injection") in exported
 * reports.
 *
 * Several export endpoints (gradebook, activity timeline, ...) place
 * user-controlled text — a student's profile name, a forum thread title
 * logged as an activity's `resourceName`, free-text notes, etc. — directly
 * into a CSV cell. CSV carries no per-cell type information, so when the
 * file is opened in Excel/Sheets/LibreOffice, any cell whose content starts
 * with `=`, `+`, `-`, `@` (or a tab/CR, which some parsers treat the same
 * way) is evaluated as a formula rather than shown as text — e.g. a thread
 * titled `=cmd|'/c calc'!A0` or a profile name of `=HYPERLINK("http://evil",
 * "click")` executes or exfiltrates data the moment an admin opens the
 * downloaded export. Quoting the cell (`"..."`) does NOT prevent this: Excel
 * still inspects the quoted content for a leading formula character.
 *
 * The standard mitigation (OWASP CSV Injection) is to prefix any such value
 * with a single quote before it is quoted, so it round-trips as inert text.
 *
 * XLSX exports (built via SheetJS `aoa_to_sheet`/`buildXlsxBuffer`) are NOT
 * affected the same way: each cell is written with an explicit type
 * (`t: 's'` for a plain string), so Excel renders it as text regardless of
 * its leading character and never re-evaluates it as a formula. This guard
 * is only needed for the plain-text CSV export path.
 */

const DANGEROUS_LEADING_CHARS = ['=', '+', '-', '@', '\t', '\r'];

/** Returns `value` as a string, neutralized if it would be read as a formula by a spreadsheet app opening the CSV. */
export function sanitizeCsvCell(value: unknown): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (DANGEROUS_LEADING_CHARS.some((prefix) => str.startsWith(prefix))) {
    return `'${str}`;
  }
  return str;
}

/** Builds a complete CSV document (with a BOM for Excel) from a header row and data rows, quoting every cell and neutralizing formula-injection attempts. */
export function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const body = [headers, ...rows]
    .map((row) => row.map((cell) => `"${sanitizeCsvCell(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return '﻿' + body;
}
