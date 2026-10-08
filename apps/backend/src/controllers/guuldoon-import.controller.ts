import { Request, Response } from 'express';
import mongoose from 'mongoose';
import GuuldoonImportBatch from '../models/guuldoon-import-batch.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import {
  buildGuuldoonUniversalTemplate,
  buildImportIssuesWorkbook,
  commitGuuldoonImport,
  importFileHashes,
  parseAndValidateGuuldoonImport,
} from '../services/guuldoon-universal-import.service';

function requireSuperAdmin(req: Request): void {
  if (req.user?.role !== 'admin' || req.user.isStaff) throw new ForbiddenError('Super Admin access required');
}

function files(req: Request): { excel?: Express.Multer.File; figures?: Express.Multer.File } {
  const uploaded = req.files as Record<string, Express.Multer.File[]> | undefined;
  return {
    excel: uploaded?.excel?.[0],
    figures: uploaded?.figures?.[0],
  };
}

export async function downloadTemplate(req: Request, res: Response): Promise<void> {
  requireSuperAdmin(req);
  const buffer = await buildGuuldoonUniversalTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Guuldoon_Universal_Import_Template.xlsx"');
  res.setHeader('Cache-Control', 'no-store');
  res.end(buffer);
}

export async function validateImport(req: Request, res: Response): Promise<Response> {
  requireSuperAdmin(req);
  const { excel, figures } = files(req);
  if (!excel) throw new BadRequestError('Excel file is required in field "excel"');

  const parsed = await parseAndValidateGuuldoonImport(req.params.courseId, excel, figures);
  const hashes = importFileHashes(excel, figures);
  const batch = await GuuldoonImportBatch.create({
    course: new mongoose.Types.ObjectId(req.params.courseId),
    uploadedBy: new mongoose.Types.ObjectId(req.user!.userId),
    filename: excel.originalname,
    zipFilename: figures?.originalname || '',
    excelHash: hashes.excelHash,
    zipHash: hashes.zipHash,
    status: 'validated',
    summary: parsed.summary,
    preview: parsed.preview,
    issues: parsed.issues,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  const errorCount = parsed.issues.filter(issue => issue.severity === 'error').length;
  const warningCount = parsed.issues.filter(issue => issue.severity === 'warning').length;
  return ApiResponse.success(res, {
    batchId: String(batch._id),
    valid: errorCount === 0,
    canImportValidRows: Object.values(parsed.summary).some(section => section.valid > 0),
    summary: parsed.summary,
    preview: parsed.preview,
    errors: parsed.issues.filter(issue => issue.severity === 'error'),
    warnings: parsed.issues.filter(issue => issue.severity === 'warning'),
    errorCount,
    warningCount,
    expiresAt: batch.expiresAt,
  }, 'Guuldoon workbook validation completed');
}

export async function commitImport(req: Request, res: Response): Promise<Response> {
  requireSuperAdmin(req);
  const batchId = String(req.body?.batchId || '');
  if (!mongoose.isValidObjectId(batchId)) throw new BadRequestError('A valid batchId is required');
  const batch = await GuuldoonImportBatch.findOne({
    _id: batchId,
    course: req.params.courseId,
    uploadedBy: req.user!.userId,
  });
  if (!batch) throw new NotFoundError('Guuldoon import batch');
  if (batch.status !== 'validated') throw new BadRequestError('This import batch has already been committed');
  if (batch.expiresAt.getTime() <= Date.now()) throw new BadRequestError('This import validation has expired. Validate the files again');

  const { excel, figures } = files(req);
  if (!excel) throw new BadRequestError('The same validated Excel file is required to commit');
  const hashes = importFileHashes(excel, figures);
  if (hashes.excelHash !== batch.excelHash || hashes.zipHash !== (batch.zipHash || '')) {
    throw new BadRequestError('Uploaded files do not match the validated import batch. Revalidate before importing');
  }

  const parsed = await parseAndValidateGuuldoonImport(req.params.courseId, excel, figures);
  const result = await commitGuuldoonImport(req.params.courseId, parsed);
  const issues = [...parsed.issues, ...result.importErrors];

  batch.status = 'committed';
  batch.committedAt = new Date();
  batch.issues = issues as any;
  batch.result = result as any;
  await batch.save();

  return ApiResponse.success(res, {
    batchId: String(batch._id),
    ...result,
    errors: issues.filter(issue => issue.severity === 'error'),
    warnings: issues.filter(issue => issue.severity === 'warning'),
  }, 'Guuldoon valid rows imported successfully');
}

export async function downloadErrorReport(req: Request, res: Response): Promise<void> {
  requireSuperAdmin(req);
  if (!mongoose.isValidObjectId(req.params.batchId)) throw new BadRequestError('Invalid import batch ID');
  const batch = await GuuldoonImportBatch.findOne({ _id: req.params.batchId, uploadedBy: req.user!.userId }).lean();
  if (!batch) throw new NotFoundError('Guuldoon import batch');
  const buffer = await buildImportIssuesWorkbook((batch.issues || []) as any);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Guuldoon_Import_Errors_${batch._id}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(buffer);
}

export async function history(req: Request, res: Response): Promise<Response> {
  requireSuperAdmin(req);
  if (!mongoose.isValidObjectId(req.params.courseId)) throw new BadRequestError('Invalid Guuldoon course ID');
  const batches = await GuuldoonImportBatch.find({
    course: req.params.courseId,
    uploadedBy: req.user!.userId,
  })
    .select('filename zipFilename status summary preview result committedAt createdAt expiresAt')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  return ApiResponse.success(res, batches);
}
