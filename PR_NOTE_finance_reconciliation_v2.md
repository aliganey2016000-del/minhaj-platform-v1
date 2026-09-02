# Finance Reconciliation v2

## Scope
- cash, bank and cash-equivalent account reconciliation
- live ledger-balance preview as of a selected date
- statement-balance reconciliation records with difference tracking
- explicit completion only after the live ledger difference reaches zero
- tenant-scoped reads and finance-manager write controls
- audit events for reconciliation creation and completion

## Endpoints
- GET `/api/v1/finance/reconciliations/accounts`
- GET `/api/v1/finance/reconciliations/preview/:accountId?asOf=YYYY-MM-DD`
- GET `/api/v1/finance/reconciliations`
- POST `/api/v1/finance/reconciliations`
- POST `/api/v1/finance/reconciliations/:id/reconcile`

## Safety
- only accounts 1100/1110/1120/1130 are eligible
- all records are scoped to the authenticated organization
- completion re-reads the live ledger before marking reconciled
