# Student Fees & Collections Roadmap

## Ujeeddo

Finance module-ka waa inuu noqdaa nidaam fudud oo school iyo jaamacad ku habboon, diiradduna waa student fees iyo lacag-qaadista. Accounting-ka guud ma aha priority-ga hadda.

## Workflow-ka rasmiga ah

```text
Fee Structure
  -> Bulk Invoice Generation
  -> Optional Payment Plan
  -> Payment Collection
  -> Receipt / Reference
  -> Student Balance
  -> Student & Parent View
  -> Semester Reports / Export
  -> Reminders
```

## Waxa hore loo dhammeeyay

- Fee Structures: school, department, iyo class scope.
- Billing cycles: one-time, monthly, term/semester, annual.
- Academic year iyo billing period.
- Bulk invoice generation.
- Duplicate invoice prevention per student + fee structure + period.
- Due date iyo academic year assignment.
- Full iyo partial payments.
- Cash, bank transfer, mobile money, iyo online methods.
- Payment date iyo transaction/reference number.
- Receipt number iyo PDF receipt.
- Payment history iyo search/filter.
- Student balances: total, discount, paid, due, collection rate.
- Parent iyo student fee views.
- Invoice status: pending, partial, paid, void.
- Refund flow iyo audit history.
- Wrong ad-hoc payment cleanup: full-refunded ad-hoc invoice wuxuu noqon karaa void.
- Payment Plan / Installments: 2 ilaa 12 installments.
- Installment amount, due date, paid amount, iyo status.
- Payment Plan view gudaha Invoice Details.
- Payment-ka hore loo qabtay wuxuu ku xirmayaa installment-ka koowaad.
- Pending iyo partial invoices labaduba Payment Plan way qaadan karaan.
- Semester/period filter ee reports.
- Excel export: collection, overdue, iyo cashier reconciliation.
- Student/parent installment reminders ilaa 3 maalmood ka hor iyo overdue.
- Automated installment-plan E2E test: pending plan, duplicate rejection, partial allocation, status updates, and total mismatch validation.
- Student sidebar-ka waxaa ku jira My Fees & Payments, ma aha Finance Management.
- Components total-ka Fee Structure wuxuu si toos ah u noqdaa Amount-ka invoice-ka.
- Record Payment wuxuu leeyahay invoice/semester selector si lacagtu ugu xiranto invoice sax ah.
- Payment collection wuxuu leeyahay review iyo explicit confirmation ka hor submit.

## Qorshayaasha xiga: Priority 1

### 1. Manual end-to-end QA

Tijaabi workflow-kan:

1. Samee fee structure: MATH, amount `$269.99`, academic year, Semester 1.
2. Generate invoice Liban iyo student kale.
3. Liban invoice-ka samee 3 installments.
4. Hubi total installment amounts = `$269.99`.
5. Qabso payment qayb ah, tusaale `$30`, adigoo dooranaya invoice-ka MATH.
6. Hubi invoice status = `Partial`.
7. Hubi installment 1 paid/partial, installments-ka kale pending.
8. Hubi student iyo parent views.
9. Hubi receipt, reference, history, balance, iyo report.
10. Test garee full payment ilaa status = `Paid`.
11. Test garee refund partial iyo full.
12. Test garee ad-hoc payment iyo void/refund behavior.

Acceptance criteria:

- Lacagtu mar walba ku dhacdaa invoice-ka la doortay.
- Ad-hoc payment lama abuuro marka invoice la doortay.
- Student total due = gross - discount - paid.
- Installment total wuxuu la mid yahay invoice total.
- Duplicate payment/invoice lama abuuro.
- Receipt-ku wuxuu leeyahay receipt number iyo reference.

### 2. Fix/verify Payment Plan UX

- Pending invoice: show `Payment Plan`.
- Partial invoice: show `Payment Plan` ama `View Payment Plan` haddii plan hore jiro.
- Existing plan: show installments inside Invoice Details.
- Paid/void invoice: disable plan action.
- Add clear message haddii plan hore u jiro.
- Add edit plan only before payment, or define a controlled correction flow.

### 3. Add installment-specific tests

Backend E2E tests waa in ay daboolaan:

- Create 2, 3, and 12 installment plans.
- Reject fewer than 2 or more than 12.
- Reject invalid amount/date.
- Reject total mismatch.
- Allow plan on pending invoice.
- Allow plan on partial invoice.
- Reject plan duplicate.
- Allocate an existing partial payment to installment 1.
- Allocate later payments in order.
- Verify paid/partial/pending statuses.
- Verify student balance after each payment.
- Verify tenant isolation and role permissions.

## Qorshayaasha xiga: Priority 2

### 4. Payment Plan management

- Add `Edit Payment Plan` before any payment is collected.
- Prevent changing paid installment amount.
- Require reason for changing a plan after partial payment.
- Add plan history/audit log.
- Add `Cancel Plan` only when no payment exists.
- Keep original plan data for audit; do not hard-delete.

### 5. Better invoice and fee filters

Add filters for:

- Academic year.
- Semester/term.
- Payment plan status.
- Overdue installments.
- School, department, class.
- Fee type.
- Students with outstanding balance only.

### 6. Semester collection dashboard

Show:

- Gross billed.
- Total collected.
- Total outstanding.
- Number of students billed.
- Number fully paid.
- Number partially paid.
- Number unpaid.
- Number overdue.
- Collection percentage.
- Collection by payment method.
- Collection by class/department.

### 7. Reports and exports

Add/export:

- Student fee ledger.
- Semester invoice report.
- Installment schedule report.
- Outstanding balances report.
- Payment history with receipt/reference.
- Refund report.
- Excel and PDF exports.
- Print-friendly student statement.

Exports must respect the selected school, class, department, academic year, semester, and date filters.

## Qorshayaasha xiga: Priority 3

### 8. Student statement

Create a printable/downloadable statement containing:

- Student name and ID.
- School/class/department.
- Academic year and semester.
- Invoice lines.
- Discount/scholarship.
- Installment schedule.
- Payments and references.
- Refunds.
- Current balance.
- Generated date.

### 9. Parent payment experience

- Show all children in one summary.
- Filter by child and semester.
- Show installment due dates.
- Show overdue warning.
- Download receipt and statement.
- Show payment request status.

### 10. Notifications

Current reminder behavior:

- Reminder up to 3 days before installment due date.
- Overdue reminder after due date.
- In-app notification, realtime event, and push when configured.
- Maximum one matching reminder per user per day.

Future improvements:

- Configurable reminder days: 7, 3, 1, and overdue.
- Admin setting to enable/disable reminders.
- Parent/student notification preference.
- WhatsApp/SMS integration if approved and configured.
- Reminder delivery log.
- Retry and failure reporting.

### 11. Currency and localization

- Remove hardcoded `$` from fee and payment screens.
- Use organization currency setting everywhere.
- Format currency consistently in UI, receipt, reports, and exports.
- Localize labels into Somali, English, and Arabic.
- Preserve numeric values in exports.

### 12. Permissions and audit

Verify roles:

- Finance read: view reports, invoices, balances, history.
- Finance operator: record payments.
- Finance manager: refunds, plan changes, sensitive corrections.
- Admin/org admin: organization-scoped management.
- Cashier: only allowed cash operations and open cash session rules.
- Student/parent: own invoices/payments only.

Audit every:

- Invoice creation.
- Invoice void/correction.
- Payment collection.
- Refund.
- Discount/scholarship.
- Payment plan creation/edit/cancel.
- Manual balance correction.

## Qorshayaasha xiga: Priority 4

### 13. Data cleanup and migration

- Find old ad-hoc invoices with full refunds and mark them void if appropriate.
- Find duplicate invoice records by student, fee structure, and period.
- Verify all historical payments have receipt numbers.
- Verify orphaned payments and invoices.
- Recalculate all student balances from invoices.
- Run a report before and after migration.
- Never delete financial history without an approved migration/audit plan.

### 14. Production readiness

- Configure local `.env` and production environment separately.
- Start backend and frontend with correct commands.
- Verify MongoDB connection.
- Verify push notification keys if push is required.
- Configure backup schedule.
- Configure audit log retention.
- Add monitoring for failed reminder jobs.
- Test deployment build and health endpoint.
- Test permissions with real role accounts.

## Technical rules for the next developer

- Invoice is the source of truth for student balances.
- Never create an ad-hoc invoice when an existing semester invoice is selected.
- Do not calculate totals by adding arbitrary Payment documents; use invoice amount, discount, and amountPaid.
- Do not hard-delete paid invoices or payments.
- Use void/refund/correction flows for financial history.
- Payment collection must be idempotent.
- Invoice generation must remain idempotent per student + fee structure + period.
- Every organization query must be tenant scoped.
- Every payment must have a receipt number.
- Installment totals must equal the invoice obligation.
- A payment plan should not change the invoice total.
- Partial payments must be allocated deterministically from installment 1 onward.
- Keep frontend and backend validation consistent.
- Add a focused test before changing shared billing logic.

## Validation commands

From `apps/backend`:

```powershell
npm run build
npm run test:financial-core
npm run test:financial-report
npm run test:finance-reconciliation
npm run test:payment-reference
npm run test:installment-plan
```

From `apps/frontend`:

```powershell
npm run build
```

## Definition of Done

Student Fees is ready for normal school use when:

- Admin can configure a semester fee once.
- Admin can generate invoices for the correct students without duplicates.
- Admin can create and explain a payment plan.
- Admin can collect full or partial payments against the correct invoice.
- Receipt and transaction reference are available.
- Student and parent can see the same balance and installment schedule.
- Refunds and corrections do not corrupt balances.
- Reports and exports match invoice/payment data.
- Reminders are delivered without daily duplicates.
- Role permissions and tenant isolation pass tests.
- The complete workflow passes manual QA and automated E2E tests.
