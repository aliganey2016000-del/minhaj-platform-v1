import { getBalanceSheet, getProfitAndLoss } from '../services/financial-report.service';

jest.mock('../models/journal-entry.model', () => ({
  __esModule: true,
  default: { aggregate: jest.fn() },
}));
jest.mock('../models/account.model', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock('../models/invoice.model', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));

import JournalEntry from '../models/journal-entry.model';

const aggregate = JournalEntry.aggregate as jest.Mock;

describe('financial-report.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calculates P&L from revenue and expense ledger balances', async () => {
    aggregate.mockResolvedValue([
      { accountId: '1', code: '4100', name: 'Tuition Revenue', type: 'revenue', debit: 0, credit: 500 },
      { accountId: '2', code: '5100', name: 'Discounts Allowed', type: 'expense', debit: 50, credit: 0 },
    ]);

    const result = await getProfitAndLoss('507f1f77bcf86cd799439011', {
      dateFrom: new Date('2026-01-01T00:00:00.000Z'),
      dateTo: new Date('2026-01-31T23:59:59.999Z'),
    });

    expect(result.totalRevenue).toBe(500);
    expect(result.totalExpenses).toBe(50);
    expect(result.netIncome).toBe(450);
  });

  it('calculates a balanced balance sheet when assets equal liabilities plus equity plus income', async () => {
    aggregate.mockResolvedValue([
      { accountId: '1', code: '1100', name: 'Cash', type: 'asset', debit: 450, credit: 0 },
      { accountId: '2', code: '4100', name: 'Tuition Revenue', type: 'revenue', debit: 0, credit: 500 },
      { accountId: '3', code: '5100', name: 'Discounts Allowed', type: 'expense', debit: 50, credit: 0 },
    ]);

    const result = await getBalanceSheet('507f1f77bcf86cd799439011', new Date('2026-01-31T23:59:59.999Z'));

    expect(result.totalAssets).toBe(450);
    expect(result.netIncome).toBe(450);
    expect(result.liabilitiesAndEquity).toBe(450);
    expect(result.balanced).toBe(true);
  });
});
