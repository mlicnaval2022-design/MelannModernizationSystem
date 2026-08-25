# Product Requirements Document

## Product
Melann Lending System V2 Modernization - Daily Cash Report (DCR) Module

## Document Purpose
This PRD defines the required behavior, formulas, data sources, and acceptance criteria for migrating the legacy Daily Cash Report module into the modern Melann React + Node.js + SQLite application.

The requirements are based on direct inspection of the legacy deployment folder at `D:\Users\Mel Rodriguez\Documents\FOR MELANN DEPLOYMENT - Copy` and the current modernization repo at `D:\ModernizationMelannSystem`.

## Background
The legacy DCR is opened from the main VB6 menu as **Daily Cash Report** / `Ctrl+D`. The legacy manual describes it as a report that shows loan releases, cash on bank, cash on hand, expenses, and collections for a selected day. Its purpose is to summarize daily cash inflows and outflows.

The current modernization repo already has a DCR module:

- Backend: `server/src/routes/dcr.js`
- Frontend: `client/src/pages/DailyCashReport.jsx`
- Schema: `tblDailyCashReport`, `tblCashOnHand`, `tblCashOnBank`, `tblPayment`, `tblLoan`, `tblExpense`

The existing modern module covers collections, releases, expenses, print, CSV export, and day closing. It still has gaps around cash-on-bank formulas, cash-on-hand display, transfer categories, branch filtering, and exact legacy report parity.

## Goals
- Reproduce the legacy DCR daily operational report in the modern system.
- Make all DCR formulas explicit, testable, and reusable by backend and frontend.
- Generate an accurate selected-date DCR covering loan releases, collections, expenses, cash on hand, cash on bank, transfers, adjustments, and end-of-day cash position.
- Allow authorized users to close a DCR date and lock included transactions.
- Provide print/PDF/Excel-ready output suitable for daily branch review.

## Non-Goals
- Rebuilding Crystal Reports.
- Changing loan, payment, or expense encoding flows beyond fields needed for DCR tagging.
- Integrating directly with external banks.
- Replacing government compliance modules, except existing DCR loan-release checklist handoff.

## Primary Users
- Cashier or teller: reviews daily encoded transactions, cash on hand, and denomination count.
- Branch manager or operations manager: validates and closes the day.
- Accounting staff: reconciles cash on hand, bank movement, releases, collections, and expenses.
- Admin: audits historical DCRs and resolves exceptions.

## Legacy Evidence
- Manual: `multiple pages\Daily Cash Report (DCR).html`
  - DCR shows loan releases, total cash on bank, total cash on hand, daily inflows, and daily outflows.
  - User selects a date from the DCR screen.
  - Report sections shown in the manual: Loan Releases, Expenses and Collections, Total Cash on Hand and on Bank.
- Menu: `app\Form\brayan MDIForm1.frm`
  - `dcr_Click()` loads `rep_DailySalesReport`.
- Report form: `app\Form\dsr.frm`
  - Opens `DSR LOANS AS MAIN.rpt`.
  - Filters loan releases by selected date: `tblLoan.DateRelease` from selected date to selected date.
  - Includes legacy loan statuses `Good` and `Full Paid`.
  - Calls `enter_date()` to insert a zero-value placeholder loan row if payments exist but no loan release exists for the selected date, so the DCR report can still render collection data.
- Cash balances: `app\Form\frmCashOnHand.frm`
  - Maintains `tblCashOnHand` and `tblCashOnBank`.
  - Allows only one cash-on-hand entry per transaction date.
  - Allows only one cash-on-bank entry per transaction date.
  - Supports add/edit for both balances.

## Current Modernization Baseline
- `GET /api/dcr/summary?date=YYYY-MM-DD`
  - Reads collections from `tblPayment`.
  - Reads loan releases from `tblLoan`.
  - Reads expenses from `tblExpense`.
  - Computes `beginning_cash` from the previous closed DCR `actual_cash_count`.
  - Computes `expected_ending_cash = beginning_cash + total_collections - total_releases - total_expenses`.
- `POST /api/dcr/close`
  - Inserts `tblDailyCashReport`.
  - Stores denomination counts, actual cash count, and variance.
  - Tags included payments, loans, and expenses with `dcr_id`.
- Frontend DCR page
  - Displays sections for loan releases, expenses, adjustments, collections, withdrawal, deposit, bank charges, interest, and cash summary.
  - Current bank-related rows are placeholders at `0.00`.
  - Current cash-on-hand and total-cash-position cards display `total_collections`, not ending cash.

## Data Sources

### Loan Releases
Modern table: `tblLoan`

Required selected-date filter:

```sql
date_released = :date
AND status NOT IN ('cancelled', 'reversed')
```

Legacy status mapping:

- Legacy `Good` and `Full Paid` are reportable.
- Modern equivalents should include active/released/fullpaid loans and exclude cancelled/reversed/draft/pending applications.

Required fields:
- Loan code
- Customer code and name
- Collector
- Branch
- Loan type
- Principal
- Net proceeds / actual cash released
- Service fee
- Insurance
- Penalty
- Passbook
- Collection deduction
- Balance

### Collections
Modern table: `tblPayment`

Required selected-date filter:

```sql
date_paid = :date
AND status NOT IN ('reversed', 'void', 'cancelled')
```

Legacy status mapping:

- Legacy reportable statuses are `Good` and `Full Paid`.
- Current status `active` should be included.

Required fields:
- OR number
- Customer code and name
- Collector
- Payment type
- Amount paid
- Encoded by
- Encoded time

### Expenses
Modern table: `tblExpense`

Required selected-date filter:

```sql
expense_date = :date
AND status = 'active'
```

Required fields:
- Category or account name
- Particulars / description
- Payee
- Amount
- Encoded by

### Cash On Hand
Modern table: `tblCashOnHand`

Required behavior:
- Store one cash-on-hand balance per branch and date.
- Permit edit with audit trail.
- Must be available to DCR as beginning and closing reference.

### Cash On Bank
Modern table: `tblCashOnBank`

Required behavior:
- Store bank transactions by branch, date, bank name, account number, transaction type, amount, and reference number.
- DCR must include deposit, withdrawal, bank charges, and bank interest totals.
- Cash-on-bank must not remain hardcoded to `0.00`.

## Formula Contract
All formulas must be computed by the backend and returned to the frontend. The frontend may format values but must not be the source of truth for totals.

### Base Totals
```text
total_collections = SUM(reportable tblPayment.amount_paid for selected date)
total_loan_releases = SUM(reportable tblLoan.net_proceeds for selected date)
total_expenses = SUM(active tblExpense.amount for selected date)
total_adjustments = SUM(active DCR cash adjustments for selected date)
total_deposits = SUM(tblCashOnBank.amount where transaction_type = 'deposit')
total_withdrawals = SUM(tblCashOnBank.amount where transaction_type = 'withdrawal')
total_bank_charges = SUM(tblCashOnBank.amount where transaction_type = 'bank_charge')
total_bank_interest = SUM(tblCashOnBank.amount where transaction_type = 'interest')
```

### Cash On Hand
```text
beginning_cash_on_hand =
  previous closed DCR actual_cash_count for same branch
  else latest tblCashOnHand opening/closing balance before selected date
  else 0

cash_available =
  beginning_cash_on_hand
  + total_collections
  + total_adjustments
  + total_withdrawals

ending_cash_on_hand =
  cash_available
  - total_loan_releases
  - total_expenses
  - total_deposits
```

Deposit is treated as money moved from cash-on-hand to bank. Withdrawal is treated as money moved from bank to cash-on-hand.

### Cash On Bank
```text
beginning_cash_on_bank =
  previous closed DCR ending_cash_on_bank for same branch
  else latest bank balance before selected date
  else 0

ending_cash_on_bank =
  beginning_cash_on_bank
  + total_deposits
  + total_bank_interest
  - total_withdrawals
  - total_bank_charges
```

### Overall Cash Position
```text
total_cash_position = ending_cash_on_hand + ending_cash_on_bank
actual_cash_count =
  (count_1000 * 1000)
  + (count_500 * 500)
  + (count_200 * 200)
  + (count_100 * 100)
  + (count_50 * 50)
  + (count_20 * 20)
  + count_coins

cash_variance = actual_cash_count - ending_cash_on_hand
```

The variance compares physical cash count to expected cash on hand, not to total cash position.

## Functional Requirements

### DCR Summary
- User can select a report date.
- User can filter by branch.
- System displays DCR number if the date is already closed.
- System displays a draft number if the date is not closed.
- Summary must include:
  - Total collections
  - Total loan releases
  - Total expenses
  - Total cash in bank
  - Cash on hand end of day
  - Total cash position

### Report Sections
The DCR page and print output must include:

1. Loan Releases
2. Expenses
3. Adjustments
4. Collections by collector
5. Withdrawal
6. Deposit
7. Bank Charges
8. Interest
9. Cash Summary
10. Signatures / prepared-review-approved area

### Day Closing
- Only authorized roles can close a day.
- System must prevent duplicate close for the same branch and date.
- Closing stores:
  - Formula totals
  - Denomination counts
  - Actual cash count
  - Variance
  - Closing user
  - Closing timestamp
  - Remarks
- Closing tags included transactions with the DCR ID.
- Once closed, included transactions must be read-only unless a manager-approved reopen/reversal workflow exists.

### Exports
- Print view must hide controls and show report content only.
- CSV/Excel export must use the same backend totals as screen display.
- PDF export may use browser print initially, but generated content must match DCR screen values.

### Compliance Handoff
- Loan release checklist from DCR may continue sending selected clients to CIC/BIR/SEC workflows.
- Checklist must use selected DCR date and include branch, collector, customer, loan amount, loan type, and release date.

## Non-Functional Requirements
- Currency must be stored as numeric values and formatted as PHP only at display/export layer.
- Formula service must be deterministic and covered by tests.
- Backend must reject invalid dates, invalid branch IDs, and negative denomination counts.
- DCR queries must remain performant for daily branch use.
- Audit trail must record close, reopen, and total-affecting edits.

## Migration Gaps To Resolve
- Current DCR backend ignores branch filtering for payments and loans.
- Current frontend hardcodes all cash-on-bank sections to `0.00`.
- Current frontend summary cards use `total_collections` for cash-on-hand and total cash position.
- Current backend lacks adjustment/deposit/withdrawal/bank-charge/interest totals in `/dcr/summary`.
- Current schema has no closed DCR fields for ending cash on bank and total cash position.
- Current DCR close endpoint checks only `report_date`, not `report_date + branch_id`.
- Current day close accepts totals from the client; backend should recompute and persist server-side totals.
- Current DCR number generation counts reports by month but should account for branch/date uniqueness rules.

## Acceptance Criteria
- Given payments on a selected date, DCR total collections equals the sum of reportable payments for that date and branch.
- Given loan releases on a selected date, DCR total loan releases equals the sum of cash actually released, preferably `net_proceeds`.
- Given expenses on a selected date, DCR total expenses equals the sum of active expenses for that date and branch.
- Given deposits, withdrawals, bank charges, and interest, DCR ending cash on bank follows the formula in this PRD.
- Given beginning cash, collections, adjustments, withdrawals, releases, expenses, and deposits, DCR ending cash on hand follows the formula in this PRD.
- Given denomination counts, actual cash count is computed server-side.
- Given actual cash count and expected ending cash on hand, variance is computed server-side.
- Closing a day persists server-computed totals and links all included transactions to the DCR record.
- Reopening or editing a closed day is blocked unless an explicit authorized workflow exists.
- Screen totals, print totals, and CSV/Excel totals match exactly for the same date and branch.

## Suggested Implementation Plan
1. Create a backend DCR calculation service used by both `/dcr/summary` and `/dcr/close`.
2. Extend schema for ending cash on bank, total cash position, adjustment totals, deposit totals, withdrawal totals, bank charge totals, and interest totals.
3. Add or normalize transaction types for cash-on-bank.
4. Fix branch filtering across payments, loans, expenses, and bank transactions.
5. Replace frontend placeholder totals with backend values.
6. Add tests for the formula service.
7. Add integration tests for summary and close endpoints.
8. Validate one sample legacy date against exported or manually checked legacy DCR output.

## Open Questions
- Should loan release cash outflow use `net_proceeds` only, or should report display also total principal and deductions separately?
- What are the exact modern statuses that correspond to legacy `Good` and `Full Paid` for loan releases and collections?
- Are deposits always transfers from cash-on-hand to bank, or can they be direct external deposits?
- Should DCR close be per branch only, or one company-wide close per date?
- Who can reopen a closed DCR, and what audit approval is required?
