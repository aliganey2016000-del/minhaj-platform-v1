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
  await Account.bulkWrite(
    DEFAULT_ACCOUNTS.map((account) => ({
      updateOne: {
        filter: { school, code: account.code },
        update: { $setOnInsert: { ...account, school, createdBy: creator } },
        upsert: true,
      },
    }))
  );
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

async function getPostingAccounts(schoolId: Id, postedBy: Id) {
  const accounts = await ensureDefaultAccounts(schoolId, postedBy);
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  for (const code of DEFAULT_ACCOUNTS.map((account) => account.code)) {
    if (!byCode.has(code)) throw new BadRequestError(`Missing default accounting account ${code}`);
  }
  return byCode;
}

export async function postInvoiceToLedger(params: {
  schoolId: Id;
  invoiceId: Id;
  amount: number;
  discount?: number;
  paymentType?: string;
  description?: string;
  postedBy: Id;
  entryDate?: Date;
}) {
  const amount = Number(params.amount || 0);
  const discount = Math.min(amount, Math.max(0, Number(params.discount || 0)));
  const net = Math.max(0, amount - discount);
  if (amount <= 0) return null;

  const school = toId(params.schoolId);
  const invoiceId = toId(params.invoiceId);
  const existing = await JournalEntry.findOne({ school, sourceType: 'invoice', sourceId: invoiceId });
  if (existing) return existing;

  const accounts = await getPostingAccounts(school, params.postedBy);
  const revenueCode = params.paymentType === 'tuition' ? '4100' : '4200';
  const lines: IJournalLine[] = [];
  if (net > 0) lines.push({ account: accounts.get('1200')!._id as mongoose.Types.ObjectId, description: 'Accounts receivable', debit: net, credit: 0 });
  if (discount > 0) lines.push({ account: accounts.get('5100')!._id as mongoose.Types.ObjectId, description: 'Invoice discount', debit: discount, credit: 0 });
  lines.push({ account: accounts.get(revenueCode)!._id as mongoose.Types.ObjectId, description: 'Student fee revenue', debit: 0, credit: amount });

  try {
    return await createJournalEntry({ schoolId: school, entryDate: params.entryDate, description: params.description || 'Invoice posted to accounting ledger', sourceType: 'invoice', sourceId: invoiceId, lines, postedBy: params.postedBy });
  } catch (err: any) {
    if (err?.code === 11000) return JournalEntry.findOne({ school, sourceType: 'invoice', sourceId: invoiceId });
    throw err;
  }
}

function paymentAssetCode(method?: string): string {
  const normalized = String(method || 'cash').toLowerCase();
  if (normalized === 'bank_transfer') return '1110';
  if (normalized === 'mobile_money') return '1120';
  if (normalized === 'online') return '1130';
  return '1100';
}

export async function postPaymentToLedger(params: {
  schoolId: Id;
  paymentId: Id;
  amount: number;
  discount?: number;
  method?: string;
  postedBy: Id;
  entryDate?: Date;
}) {
  const amount = Number(params.amount || 0);
  const discount = Math.min(amount, Math.max(0, Number(params.discount || 0)));
  const cash = Math.max(0, amount - discount);
  if (amount <= 0) return null;

  const school = toId(params.schoolId);
  const paymentId = toId(params.paymentId);
  const existing = await JournalEntry.findOne({ school, sourceType: 'payment', sourceId: paymentId });
  if (existing) return existing;

  const accounts = await getPostingAccounts(school, params.postedBy);
  const lines: IJournalLine[] = [];
  if (cash > 0) lines.push({ account: accounts.get(paymentAssetCode(params.method))!._id as mongoose.Types.ObjectId, description: `${String(params.method || 'cash').toLowerCase()} payment`, debit: cash, credit: 0 });
  if (discount > 0) lines.push({ account: accounts.get('5100')!._id as mongoose.Types.ObjectId, description: 'Payment discount', debit: discount, credit: 0 });
  lines.push({ account: accounts.get('1200')!._id as mongoose.Types.ObjectId, description: 'Accounts receivable settlement', debit: 0, credit: amount });

  try {
    return await createJournalEntry({ schoolId: school, entryDate: params.entryDate, description: 'Payment posted to accounting ledger', sourceType: 'payment', sourceId: paymentId, lines, postedBy: params.postedBy });
  } catch (err: any) {
    if (err?.code === 11000) return JournalEntry.findOne({ school, sourceType: 'payment', sourceId: paymentId });
    throw err;
  }
}

export async function postRefundToLedger(params: {
  schoolId: Id;
  refundId: Id;
  amount: number;
  method?: string;
  postedBy: Id;
  entryDate?: Date;
}) {
  const amount = Number(params.amount || 0);
  if (amount <= 0) return null;

  const school = toId(params.schoolId);
  const refundId = toId(params.refundId);
  const existing = await JournalEntry.findOne({ school, sourceType: 'refund', sourceId: refundId });
  if (existing) return existing;

  const accounts = await getPostingAccounts(school, params.postedBy);
  try {
    return await createJournalEntry({
      schoolId: school,
      entryDate: params.entryDate,
      description: 'Refund posted to accounting ledger',
      sourceType: 'refund',
      sourceId: refundId,
      lines: [
        { account: accounts.get('1200')!._id as mongoose.Types.ObjectId, description: 'Refunded receivable', debit: amount, credit: 0 },
        { account: accounts.get(paymentAssetCode(params.method))!._id as mongoose.Types.ObjectId, description: `${String(params.method || 'cash').toLowerCase()} refund`, debit: 0, credit: amount },
      ],
      postedBy: params.postedBy,
    });
  } catch (err: any) {
    if (err?.code === 11000) return JournalEntry.findOne({ school, sourceType: 'refund', sourceId: refundId });
    throw err;
  }
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
