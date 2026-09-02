import mongoose from 'mongoose';
import Account from '../models/account.model';
import FinanceReconciliation from '../models/finance-reconciliation.model';
import JournalEntry from '../models/journal-entry.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';

type Id = mongoose.Types.ObjectId | string;
const RECONCILABLE_CODES = ['1100', '1110', '1120', '1130'];

function toId(value: Id): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new BadRequestError('Invalid accounting identifier');
  return new mongoose.Types.ObjectId(value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getReconciliableAccounts(schoolId: Id) {
  return Account.find({ school: toId(schoolId), active: true, code: { $in: RECONCILABLE_CODES } })
    .sort({ code: 1 })
    .lean();
}

export async function getLedgerBalance(schoolId: Id, accountId: Id, asOf: Date) {
  const school = toId(schoolId);
  const account = await Account.findOne({ _id: toId(accountId), school, active: true });
  if (!account) throw new NotFoundError('Accounting account');
  if (!RECONCILABLE_CODES.includes(account.code)) {
    throw new BadRequestError('Only cash and cash-equivalent accounts can be reconciled');
  }

  const [row] = await JournalEntry.aggregate([
    { $match: { school, entryDate: { $lte: asOf }, 'lines.account': account._id } },
    { $unwind: '$lines' },
    { $match: { 'lines.account': account._id } },
    { $group: { _id: null, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
  ]);

  return {
    account: { _id: account._id, code: account.code, name: account.name },
    ledgerBalance: round(Number(row?.debit || 0) - Number(row?.credit || 0)),
  };
}

export async function createReconciliation(params: {
  schoolId: Id;
  accountId: Id;
  asOf: Date;
  statementBalance: number;
  notes?: string;
  createdBy: Id;
}) {
  const statementBalance = Number(params.statementBalance);
  if (!Number.isFinite(statementBalance)) throw new BadRequestError('Statement balance must be a valid number');

  const { account, ledgerBalance } = await getLedgerBalance(params.schoolId, params.accountId, params.asOf);
  const difference = round(statementBalance - ledgerBalance);
  return FinanceReconciliation.create({
    school: toId(params.schoolId),
    account: account._id,
    asOf: params.asOf,
    statementBalance: round(statementBalance),
    ledgerBalance,
    difference,
    status: difference === 0 ? 'reconciled' : 'open',
    notes: params.notes,
    createdBy: toId(params.createdBy),
    reconciledBy: difference === 0 ? toId(params.createdBy) : undefined,
    reconciledAt: difference === 0 ? new Date() : undefined,
  });
}

export async function reconcileExisting(params: { schoolId: Id; reconciliationId: Id; userId: Id; notes?: string }) {
  const reconciliation = await FinanceReconciliation.findOne({ _id: toId(params.reconciliationId), school: toId(params.schoolId) });
  if (!reconciliation) throw new NotFoundError('Reconciliation');
  if (reconciliation.status === 'reconciled') return reconciliation;
  const { ledgerBalance } = await getLedgerBalance(params.schoolId, reconciliation.account, reconciliation.asOf);
  const difference = round(reconciliation.statementBalance - ledgerBalance);
  if (difference !== 0) throw new BadRequestError(`Cannot reconcile while the difference is ${difference.toFixed(2)}`);

  reconciliation.ledgerBalance = ledgerBalance;
  reconciliation.difference = 0;
  reconciliation.status = 'reconciled';
  reconciliation.reconciledBy = toId(params.userId);
  reconciliation.reconciledAt = new Date();
  if (params.notes !== undefined) reconciliation.notes = params.notes;
  await reconciliation.save();
  return reconciliation;
}

export async function listReconciliations(schoolId: Id, options?: { status?: string; accountId?: Id; limit?: number }) {
  const filter: Record<string, unknown> = { school: toId(schoolId) };
  if (options?.status && ['open', 'reconciled'].includes(options.status)) filter.status = options.status;
  if (options?.accountId) filter.account = toId(options.accountId);
  const limit = Math.min(100, Math.max(1, options?.limit || 50));
  return FinanceReconciliation.find(filter)
    .populate('account', 'code name type normalBalance')
    .populate('createdBy', 'email')
    .populate('reconciledBy', 'email')
    .sort({ asOf: -1, createdAt: -1 })
    .limit(limit)
    .lean();
}
