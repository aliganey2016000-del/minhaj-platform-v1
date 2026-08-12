import { Express } from 'express';
import { BadRequestError } from './api-error';

const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Performs inexpensive checks before a user-supplied spreadsheet reaches a
 * parser. This is deliberately based on the filename and bytes—not the MIME
 * type, which browsers can omit or clients can spoof.
 */
export function assertSafeSpreadsheetUpload(file: Express.Multer.File): void {
  const filename = file.originalname.toLowerCase();
  const extension = filename.slice(filename.lastIndexOf('.'));

  if (!SPREADSHEET_EXTENSIONS.has(extension)) {
    throw new BadRequestError('Only .xlsx, .xls, and .csv spreadsheet files are supported');
  }

  if (!file.buffer?.length) {
    throw new BadRequestError('The uploaded spreadsheet is empty');
  }

  if (extension === '.xlsx' && !file.buffer.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    throw new BadRequestError('The uploaded .xlsx file is not a valid Excel workbook');
  }

  if (extension === '.csv' && file.buffer.includes(0)) {
    throw new BadRequestError('The uploaded CSV file contains binary data');
  }
}
