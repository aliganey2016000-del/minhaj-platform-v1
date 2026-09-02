import { Request, Response } from 'express';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import { createJournalEntry, ensureDefaultAccounts, getAccounts, getTrialBalance, listJournalEntries } from '../services/accounting.service';
import { getArAging, getBalanceSheet, getCashPosition, getProfitAndLoss } from '../services/financial-report.service';
import { AuditLogger } from '../utils/audit-logger';

function schoolIdFromRequest(req: Request): string {
  const schoolId = req.user?.organizationId;
  if (!schoolId) throw new BadRequestError('A school/organization context is required for accounting operations');
  return String(schoolId);
}

function parseDate(value: unknown, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const raw = String(value);
  const date = new Date(`${raw.slice(0, 10)}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  if (Number.isNaN(date.getTime())) throw new BadRequestError('Invalid accounting date');
  return date;
}

export async function getAccountsController(req: Request, res: Response): Promise<Response> {
  return ApiResponse.success(res, await getAccounts(schoolIdFromRequest(req)));
}

export async function seedDefaultAccounts(req: Request, res: Response): Promise<Response> {
  const accounts = await ensureDefaultAccounts(schoolIdFromRequest(req), req.user!.userId);
  await AuditLogger.logAction(req.user!.userId, 'CHART_OF_ACCOUNTS_INITIALIZED', 'Accounting', String(req.user!.organizationId), req, {
    details: { accountCount: accounts.length },
    organizationId: String(req.user!.organizationId),
  });
  return ApiResponse.success(res, accounts, 'Default chart of accounts is ready');
}

export async function createJournal(req: Request, res: Response): Promise<Response> {
  const { description, entryDate, sourceType, sourceId, lines } = req.body || {};
  const entry = await createJournalEntry({
    schoolId: schoolIdFromRequest(req),
    entryDate: parseDate(entryDate) || new Date(),
    description,
    sourceType,
    sourceId,
    lines,
    postedBy: req.user!.userId,
  });
  await AuditLogger.logAction(req.user!.userId, 'JOURNAL_ENTRY_POSTED', 'JournalEntry', String(entry._id), req, {
    details: { entryNumber: entry.entryNumber, description: entry.description },
    organizationId: String(req.user!.organizationId),
  });
  return ApiResponse.created(res, entry, 'Journal entry posted');
}

export async function getJournals(req: Request, res: Response): Promise<Response> {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const result = await listJournalEntries(schoolIdFromRequest(req), {
    page,
    limit,
    dateFrom: parseDate(req.query.dateFrom),
    dateTo: parseDate(req.query.dateTo, true),
  });
  return ApiResponse.success(res, result);
}

export async function getTrialBalanceController(req: Request, res: Response): Promise<Response> {
  const result = await getTrialBalance(schoolIdFromRequest(req), {
    dateFrom: parseDate(req.query.dateFrom),
    dateTo: parseDate(req.query.dateTo, true),
  });
  return ApiResponse.success(res, result);
}

export async function getProfitAndLossController(req: Request, res: Response): Promise<Response> {
  const result = await getProfitAndLoss(schoolIdFromRequest(req), {
    dateFrom: parseDate(req.query.dateFrom),
    dateTo: parseDate(req.query.dateTo, true),
  });
  return ApiResponse.success(res, result);
}

export async function getBalanceSheetController(req: Request, res: Response): Promise<Response> {
  const result = await getBalanceSheet(schoolIdFromRequest(req), parseDate(req.query.asOf, true));
  return ApiResponse.success(res, result);
}

export async function getArAgingController(req: Request, res: Response): Promise<Response> {
  const result = await getArAging(schoolIdFromRequest(req), parseDate(req.query.asOf, true));
  return ApiResponse.success(res, result);
}

export async function getCashPositionController(req: Request, res: Response): Promise<Response> {
  const result = await getCashPosition(schoolIdFromRequest(req), parseDate(req.query.asOf, true));
  return ApiResponse.success(res, result);
}
