import { NextFunction, Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { BadRequestError } from '../utils/api-error';
import { assertSafeSpreadsheetUpload } from '../utils/spreadsheet-upload';

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getEmail(row: Record<string, unknown>): string {
  const key = Object.keys(row).find((candidate) => {
    const normalized = candidate.trim().toLowerCase();
    return normalized === 'email' || normalized === 'student email';
  });
  return key ? String(row[key] ?? '').trim().toLowerCase() : '';
}

/** Student Email is part of the canonical registration contract. */
export async function requireStudentEmailForCreate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) throw new BadRequestError('Student Email is required');
  if (!SIMPLE_EMAIL.test(email)) throw new BadRequestError('Student Email is invalid');
  req.body.email = email;
  next();
}

/**
 * Fail fast before preview/import when any non-empty spreadsheet row has no
 * Student Email. The main importer still performs uniqueness and full row
 * validation; this middleware only enforces the now-required contract.
 */
export async function requireStudentEmailInImport(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');
  assertSafeSpreadsheetUpload(req.file);

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: false });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const values = Object.values(row).map((value) => String(value ?? '').trim());
    if (values.every((value) => value === '')) continue;

    const email = getEmail(row);
    if (!email) throw new BadRequestError(`Row ${index + 2}: Student Email is required`);
    if (!SIMPLE_EMAIL.test(email)) throw new BadRequestError(`Row ${index + 2}: Student Email is invalid`);
  }

  next();
}
