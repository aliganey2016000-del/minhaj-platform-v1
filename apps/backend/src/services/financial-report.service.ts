import mongoose from 'mongoose';
import Account from '../models/account.model';
import JournalEntry from '../models/journal-entry.model';
import Invoice from '../models/invoice.model';
import { BadRequestError } from '../utils/api-error';

type Id = mongoose.Types.ObjectId | string;

function toId(value: Id): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new BadRequestError('Invalid accounting identifier');
  return new mongoose.Types.ObjectId(value);
}

function dateFilter(dateFrom?: Date, dateTo?: Date) {
  if (!dateFrom && !dateTo) return {};
  return {
    entryDate: {
      ...(dateFrom ? { $gte: dateFrom } : {}),
      ...(dateTo ? { $lte: dateTo } : {}),
    },
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getProfitAndLoss(schoolId: Id, options?: { dateFrom?: Date; dateTo?: Date }) {
  const school = toId(schoolId);
  const rows = await JournalEntry.aggregate([
    { $match: { school, ...dateFilter(options?.dateFrom, options?.dateTo) } },
    { $unwind: '$lines' },
    { $group: {
      _id: '$lines.account',
      debit: { $sum: '$lines.debit' },
      credit: { $sum: '$lines.credit' },
    } },
    { $lookup: { from: 'accounts', localField: '_id', foreignField: '_id', as: 'account' } },
    { $unwind: '$account' },
    { $match: { 'account.school': school, 'account.active': true, 'account.type': { $in: ['revenue', 'expense'] } } },
    { $project: {
      _id: 0,
      accountId: '$_id',
      code: '$account.code',
      name: '$account.name',
      type: '$account.type',
      debit: 1,
      credit: 1,
    } },
    { $sort: { code: 1 } },
  ]);

  const revenue = rows.filter((row: any) => row.type === 'revenue').map((row: any) => ({
    accountId: row.accountId,
    code: row.code,
    name: row.name,
    amount: round(Number(row.credit || 0) - Number(row.debit || 0)),
  }));
  const expenses = rows.filter((row: any) => row.type === 'expense').map((row: any) => ({
    accountId: row.accountId,
    code: row.code,
    name: row.name,
    amount: round(Number(row.debit || 0) - Number(row.credit || 0)),
  }));

  const totalRevenue = round(revenue.reduce((sum, row) => sum + row.amount, 0));
  const totalExpenses = round(expenses.reduce((sum, row) => sum + row.amount, 0));
  return {
    dateFrom: options?.dateFrom || null,
    dateTo: options?.dateTo || null,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netIncome: round(totalRevenue - totalExpenses),
  };
}

export async function getBalanceSheet(schoolId: Id, asOf?: Date) {
  const school = toId(schoolId);
  const filter: Record<string, unknown> = { school };
  if (asOf) filter.entryDate = { $lte: asOf };

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
    { $match: { 'account.school': school, 'account.active': true, 'account.type': { $in: ['asset', 'liability', 'equity', 'revenue', 'expense'] } } },
    { $project: {
      _id: 0,
      accountId: '$_id',
      code: '$account.code',
      name: '$account.name',
      type: '$account.type',
      debit: 1,
      credit: 1,
    } },
    { $sort: { code: 1 } },
  ]);

  const assets = rows.filter((row: any) => row.type === 'asset').map((row: any) => ({
    accountId: row.accountId, code: row.code, name: row.name,
    amount: round(Number(row.debit || 0) - Number(row.credit || 0)),
  }));
  const liabilities = rows.filter((row: any) => row.type === 'liability').map((row: any) => ({
    accountId: row.accountId, code: row.code, name: row.name,
    amount: round(Number(row.credit || 0) - Number(row.debit || 0)),
  }));
  const equity = rows.filter((row: any) => row.type === 'equity').map((row: any) => ({
    accountId: row.accountId, code: row.code, name: row.name,
    amount: round(Number(row.credit || 0) - Number(row.debit || 0)),
  }));

  const revenue = round(rows.filter((row: any) => row.type === 'revenue').reduce((sum, row) => sum + Number(row.credit || 0) - Number(row.debit || 0), 0));
  const expenses = round(rows.filter((row: any) => row.type === 'expense').reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0));
  const netIncome = round(revenue - expenses);
  const totalAssets = round(assets.reduce((sum, row) => sum + row.amount, 0));
  const totalLiabilities = round(liabilities.reduce((sum, row) => sum + row.amount, 0));
  const totalEquity = round(equity.reduce((sum, row) => sum + row.amount, 0));
  const liabilitiesAndEquity = round(totalLiabilities + totalEquity + netIncome);

  return {
    asOf: asOf || new Date(),
    assets,
    liabilities,
    equity,
    retainedEarnings: netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncome,
    liabilitiesAndEquity,
    balanced: round(totalAssets - liabilitiesAndEquity) === 0,
  };
}

export async function getArAging(schoolId: Id, asOf?: Date) {
  const school = toId(schoolId);
  const cutoff = asOf || new Date();
  const invoices = await Invoice.find({
    school,
    status: { $ne: 'void' },
    issueDate: { $lte: cutoff },
  })
    .select('_id student title period amount discount amountPaid dueDate status paymentType issueDate academicYear')
    .sort({ dueDate: 1 })
    .lean();

  const buckets = { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, over90: 0 };
  const items = invoices.map((invoice: any) => {
    const balance = Math.max(0, Number(invoice.amount || 0) - Number(invoice.discount || 0) - Number(invoice.amountPaid || 0));
    if (balance <= 0) return null;
    const due = new Date(invoice.dueDate);
    const ageDays = Math.max(0, Math.floor((cutoff.getTime() - due.getTime()) / 86400000));
    let bucket: keyof typeof buckets = 'current';
    if (due <= cutoff) {
      if (ageDays <= 30) bucket = 'days1To30';
      else if (ageDays <= 60) bucket = 'days31To60';
      else if (ageDays <= 90) bucket = 'days61To90';
      else bucket = 'over90';
    }
    buckets[bucket] = round(buckets[bucket] + balance);
    return {
      invoiceId: invoice._id,
      studentId: invoice.student,
      title: invoice.title,
      period: invoice.period,
      paymentType: invoice.paymentType,
      dueDate: invoice.dueDate,
      amount: Number(invoice.amount || 0),
      discount: Number(invoice.discount || 0),
      amountPaid: Number(invoice.amountPaid || 0),
      balance: round(balance),
      ageDays,
      bucket,
    };
  }).filter(Boolean);

  const totalOutstanding = round(Object.values(buckets).reduce((sum, value) => sum + value, 0));
  return { asOf: cutoff, buckets, totalOutstanding, items };
}

export async function getCashPosition(schoolId: Id, asOf?: Date) {
  const school = toId(schoolId);
  const accounts = await Account.find({ school, active: true, code: { $in: ['1100', '1110', '1120', '1130'] } }).sort({ code: 1 }).lean();
  const accountIds = accounts.map((account) => account._id);
  const filter: Record<string, unknown> = { school, 'lines.account': { $in: accountIds } };
  if (asOf) filter.entryDate = { $lte: asOf };

  const rows = await JournalEntry.aggregate([
    { $match: filter },
    { $unwind: '$lines' },
    { $match: { 'lines.account': { $in: accountIds } } },
    { $group: { _id: '$lines.account', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
  ]);
  const byId = new Map(rows.map((row: any) => [String(row._id), row]));
  const balances = accounts.map((account: any) => {
    const row: any = byId.get(String(account._id));
    return { accountId: account._id, code: account.code, name: account.name, amount: round(Number(row?.debit || 0) - Number(row?.credit || 0)) };
  });
  return { asOf: asOf || new Date(), balances, totalCashAndEquivalents: round(balances.reduce((sum, row) => sum + row.amount, 0)) };
}
