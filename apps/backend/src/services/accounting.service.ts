import mongoose from 'mongoose';
import Account, { AccountType, IAccount, NormalBalance } from '../models/account.model';
import JournalEntry, { IJournalEntry, IJournalLine } from '../models/journal-entry.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';

type Id = mongoose.Types.ObjectId | string;

const DEFAULT_ACCOUNTS: Array<{ code: string; name: string; type: AccountType; normalBalance: NormalBalance; description: string }> = [
  { code: '1100', name: 'Cash', type: 'asset', normalBalance: 'debit', description: 'Cash on hand and cash drawer balances' },
  { code: '1110', name: 'Bank', type: 'asset', normalBalance: 'debit', description: 'School bank account balances' },
  { code: '1120', name: 'Mobile Money', type: 'asset', normalBalance: 'debit', description: 'Mobile money collection balances' },
  { code: '1130', name: 'Online Clearing', type: 'asset', normalBalance: 'debit', description: 'Online payment processor clearing balances' },
  { code: '1200', name: 'Accounts Receivable', type: 'asset', normalBalance: 'debit', description: 'Student invoice receivables' },
  { code: '4100', name: 'Tuition Revenue', type: 'revenue', normalBalance: 'credit', description: 'Tuition and school fee revenue' },
  { code: '4200', name: 'Other Student Revenue', type: 'revenue', normalBalance: 'credit', description: 'Registration, exam, material and other student revenue' },
  { code: '5100', name: 'Discounts Allowed', type: 'expense', normalBalance: 'debit', description: 'Approved discounts and fee waivers' },
];

function toId(value: Id): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new BadRequestError('Invalid accounting identifier');
  return new mongoose.Types.ObjectId(value);
}

export async function ensureDefaultAccounts(schoolId: Id, createdBy: Id): Promise<IAccount[]> {
  const school = toId(schoolId);
  const creator = toId(createdBy);
  const existing = await Account.find({ school }).sort({ code: 1 });
  const byCode = new Map(existing.map((account) => [account.code, account]));
  const missing = DEFAULT_ACCOUNTS.filter((account) => !byCode.has(account.code));
  if (missing.length) {
    await Account.insertMany(missing.map((account) => ({ ...account, school, createdBy: creator })));
  }
  return Account.find({ school }).sort({ code: 1 });
}

export async function createJournalEntry(params: {
  schoolId: Id;
  entryDate?: Date;
  description: string;
  sourceType?: string;
  sourceId?: Id;
  lines: IJournalLine[];
  postedBy: Id;
}): Promise<IJournalEntry> {
  const school = toId(params.schoolId);
  const postedBy = toId(params.postedBy);
  if (!params.description?.trim()) throw new BadRequestError('Journal description is required');
  if (!Array.isArray(params.lines) || params.lines.length < 2) throw new BadRequestError('At least two journal lines are required');

  const accountIds = params.lines.map((line) => toId(line.account));
  const accounts = await Account.find({ _id: { $in: accountIds }, school, active: true }).select('_id');
  if (accounts.length !== new Set(accountIds.map(String)).size) {
    throw new BadRequestError('Every journal line must reference an active account in the same school');
  }

  const debit = Math.round(params.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0) * 100);
  const credit = Math.round(params.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0) * 100);
  if (debit <= 0 || debit !== credit) throw new BadRequestError('Journal entry must balance to equal positive debit and credit totals');

  const entry = await JournalEntry.create({
    school,
    entryNumber: `JE-${new Date().getFullYear()}-${new mongoose.Types.ObjectId().toHexString().toUpperCase()}`,
    entryDate: params.entryDate || new Date(),
    description: params.description.trim(),
    sourceType: params.sourceType?.trim() || undefined,
    sourceId: params.sourceId ? toId(params.sourceId) : undefined,
    lines: params.lines.map((line) => ({
      account: toId(line.account),
      description: line.description?.trim() || '',
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    })),
    postedBy,
  });
  return entry;
}

export async function listJournalEntries(schoolId: Id, options?: { page?: number; limit?: number; dateFrom?: Date; dateTo?: Date }) {
  const school = toId(schoolId);
  const page = Math.max(1, options?.page || 1);
  const limit = Math.min(100, Math.max(1, options?.limit || 50));
  const filter: Record<string, unknown> = { school };
  if (options?.dateFrom || options?.dateTo) {
    filter.entryDate = {
      ...(options.dateFrom ? { $gte: options.dateFrom } : {}),
      ...(options.dateTo ? { $lte: options.dateTo } : {}),
    };
  }
  const [items, total] = await Promise.all([
    JournalEntry.find(filter)
      .populate('lines.account', 'code name type normalBalance')
      .populate('postedBy', 'email')
      .sort({ entryDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    JournalEntry.countDocuments(filter),
  ]);
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getTrialBalance(schoolId: Id, options?: { dateFrom?: Date; dateTo?: Date }) {
  const school = toId(schoolId);
  const filter: Record<string, unknown> = { school };
  if (options?.dateFrom || options?.dateTo) {
    filter.entryDate = {
      ...(options.dateFrom ? { $gte: options.dateFrom } : {}),
      ...(options.dateTo ? { $lte: options.dateTo } : {}),
    };
  }

  const rows = await JournalEntry.aggregate([
    { $match: filter },
    { $unwind: '$lines' },
    { $group: {
      _id: '$lines.account',
      debit: { $sum: '$lines.debit' },
      credit: { $sum: '$lines.credit' },
    } },
    { $lookup: { from: 'accounts', localField: '_id', foreignField: '_id', as: 'account' } },
    { $unwind: '$account' },
    { $match: { 'account.school': school, 'account.active': true } },
    { $project: {
      _id: 0,
      accountId: '$_id',
      code: '$account.code',
      name: '$account.name',
      type: '$account.type',
      debit: { $round: ['$debit', 2] },
      credit: { $round: ['$credit', 2] },
      balance: { $round: [{ $subtract: ['$debit', '$credit'] }, 2] },
    } },
    { $sort: { code: 1 } },
  ]);

  const totalDebit = Math.round(rows.reduce((sum, row: any) => sum + Number(row.debit || 0), 0) * 100) / 100;
  const totalCredit = Math.round(rows.reduce((sum, row: any) => sum + Number(row.credit || 0), 0) * 100) / 100;
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export async function getAccounts(schoolId: Id) {
  return Account.find({ school: toId(schoolId) }).sort({ code: 1 }).lean();
}

export async function getAccountOrThrow(schoolId: Id, accountId: Id) {
  const account = await Account.findOne({ _id: toId(accountId), school: toId(schoolId), active: true });
  if (!account) throw new NotFoundError('Account');
  return account;
}
