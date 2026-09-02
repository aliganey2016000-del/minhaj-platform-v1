import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Finance reconciliation contract', () => {
  const route = readFileSync(resolve(__dirname, '../routes/v1/finance-reconciliation.routes.ts'), 'utf8');
  const model = readFileSync(resolve(__dirname, '../models/finance-reconciliation.model.ts'), 'utf8');
  const service = readFileSync(resolve(__dirname, '../services/finance-reconciliation.service.ts'), 'utf8');

  it('protects reads and write operations with finance roles', () => {
    expect(route).toContain("router.get('/', financialRead");
    expect(route).toContain("router.post('/', financialManager");
    expect(route).toContain("router.post('/:id/reconcile', financialManager");
  });

  it('keeps reconciliation tenant-scoped and limited to cash-equivalent accounts', () => {
    expect(model).toContain("school: { type: Schema.Types.ObjectId, ref: 'School', required: true");
    expect(service).toContain("const RECONCILABLE_CODES = ['1100', '1110', '1120', '1130']");
    expect(service).toContain('school: toId(schoolId)');
    expect(service).toContain('Only cash and cash-equivalent accounts can be reconciled');
  });

  it('only marks a reconciliation complete when the live ledger difference is zero', () => {
    expect(service).toContain("if (difference !== 0) throw new BadRequestError");
    expect(service).toContain("reconciliation.status = 'reconciled'");
  });
});
