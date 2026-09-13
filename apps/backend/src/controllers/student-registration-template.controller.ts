import { Request, Response } from 'express';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

const HEADERS = [
  'First Name',
  'Last Name',
  'Gender',
  'Email',
  'Class Name',
  'Section',
  'Enrollment Date',
  'Medical Notes',
  'Guardian Name',
  'Guardian Email',
  'Guardian Phone',
  'Relationship',
];

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const rows = [[
    'Ahmed',
    'Ali',
    'male',
    'ahmed.ali@example.com',
    'Grade 5',
    'A',
    new Date().toISOString().slice(0, 10),
    '',
    'Mohamed Ali',
    '',
    '+252612345678',
    'Father',
  ]];

  const buffer = buildXlsxBuffer(HEADERS, rows, 'Student Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=students-template.xlsx');
  res.end(buffer);
};
