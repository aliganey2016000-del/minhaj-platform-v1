import { Request, Response } from 'express';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import {
  createReconciliation,
  getLedgerBalance,
  getReconciliableAccounts,
  listReconciliations,
  reconcileExisting,
} from '../services/finance-reconciliation.service';
import { AuditLogger } from '../utils/audit-logger';

function schoolIdFromRequest(req: Request): string {
  const schoolId = req.user?.organizationId;
  if (!schoolId) throw new BadRequestError('A school/organization context is required');
  return String(schoolId);
}

function parseDate(value: unknown, endOfDay = false): Date {
  if (!value) throw new BadRequestError('A reconciliation date is required');
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  if (Number.isNaN(date.getTime())) throw new BadRequestError('Invalid reconciliation date');
  return date;
}

export async function getAccounts(req: Request, res: Response): Promise<Response> {
  return ApiResponse.success(res, await getReconciliableAccounts(schoolIdFromRequest(req)));
}

export async function preview(req: Request, res: Response): Promise<Response> {
  const result = await getLedgerBalance(schoolIdFromRequest(req), String(req.params.accountId), parseDate(req.query.asOf, true));
  return ApiResponse.success(res, result);
}

export async function create(req: Request, res: Response): Promise<Response> {
  const reconciliation = await createReconciliation({
    schoolId: schoolIdFromRequest(req),
    accountId: String(req.body?.accountId),
    asOf: parseDate(req.body?.asOf, true),
    statementBalance: Number(req.body?.statementBalance),
    notes: req.body?.notes,
    createdBy: req.user!.userId,
  });
  await AuditLogger.logAction(req.user!.userId, 'FINANCE_RECONCILIATION_CREATED', 'FinanceReconciliation', String(reconciliation._id), req, {
    details: { accountId: String(reconciliation.account), difference: reconciliation.difference, status: reconciliation.status },
    organizationId: String(req.user!.organizationId),
  });
  return ApiResponse.created(res, reconciliation, 'Reconciliation recorded');
}

export async function list(req: Request, res: Response): Promise<Response> {
  const result = await listReconciliations(schoolIdFromRequest(req), {
    status: req.query.status ? String(req.query.status) : undefined,
    accountId: req.query.accountId ? String(req.query.accountId) : undefined,
    limit: Number(req.query.limit) || 50,
  });
  return ApiResponse.success(res, result);
}

export async function reconcile(req: Request, res: Response): Promise<Response> {
  const reconciliation = await reconcileExisting({
    schoolId: schoolIdFromRequest(req),
    reconciliationId: String(req.params.id),
    userId: req.user!.userId,
    notes: req.body?.notes,
  });
  await AuditLogger.logAction(req.user!.userId, 'FINANCE_RECONCILIATION_COMPLETED', 'FinanceReconciliation', String(reconciliation._id), req, {
    details: { difference: reconciliation.difference, status: reconciliation.status },
    organizationId: String(req.user!.organizationId),
  });
  return ApiResponse.success(res, reconciliation, 'Reconciliation completed');
}
