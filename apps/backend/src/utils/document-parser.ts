/**
 * Document Parser — extracts plain text from an uploaded lesson source file,
 * ready to hand to the DeepSeek prompt.
 *
 * Supported: PDF (.pdf), Word (.docx), PowerPoint (.pptx), Excel (.xlsx/.xls).
 * Legacy pre-2007 binary Office formats (.doc, .ppt) are NOT supported — ask
 * the user to re-save as the modern Open XML format, or paste text instead.
 */

import path from 'path';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { BadRequestError } from './api-error';

export async function extractTextFromDocument(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case '.pdf':
      return extractFromPdf(buffer);
    case '.docx':
      return extractFromDocx(buffer);
    case '.pptx':
      return extractFromPptx(buffer);
    case '.xlsx':
    case '.xls':
      return extractFromSpreadsheet(buffer);
    case '.doc':
    case '.ppt':
      throw new BadRequestError(
        `Legacy ${ext} files aren't supported — please re-save as ${ext === '.doc' ? '.docx' : '.pptx'}, or paste the text into the Notes tab instead.`
      );
    default:
      throw new BadRequestError(`Unsupported file type "${ext || 'unknown'}". Upload a PDF, Word, PowerPoint, or Excel file.`);
  }
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text || '';
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractFromSpreadsheet(buffer: Buffer): Promise<string> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) parts.push(`Sheet: ${sheetName}\n${csv}`);
  }
  return parts.join('\n\n');
}

/** .pptx is a zip of per-slide XML files; pull the text out of each <a:t> run. */
async function extractFromPptx(buffer: Buffer): Promise<string> {
  const zip = new AdmZip(buffer);
  const slideEntries = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => slideNumber(a.entryName) - slideNumber(b.entryName));

  const slides: string[] = [];
  for (const entry of slideEntries) {
    const xml = entry.getData().toString('utf-8');
    const texts = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]);
    if (texts.length) slides.push(texts.join(' '));
  }
  return slides.map((s, i) => `Slide ${i + 1}: ${s}`).join('\n\n');
}

function slideNumber(entryName: string): number {
  return parseInt(entryName.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
}
