# Product Requirements Document

## Product
Melann Lending System V2

## Document Purpose
This PRD describes the current product represented by the codebase in `app/`, based on direct inspection of the VB6 project files, forms, modules, and reports. It is written to help maintenance, stabilization, audit, and future modernization work.

## Background
Melann Lending System V2 is a Windows desktop lending operations application built in Visual Basic 6. It appears to support end-to-end management of small-loan operations, including customer onboarding, loan release, repayment encoding, reversals, collector tracking, branch support, deposits, expenses, and operational reporting.

The compiled target is `webplus.exe`, and the application starts from a login form before opening an MDI workspace for daily operations.

## Product Vision
Provide branch and back-office staff with a single operational system for managing the daily lifecycle of lending accounts, cash activity, collectors, and reports in a fast, form-based desktop workflow.

## Goals
- Allow staff to authenticate and access role-based lending workflows.
- Maintain customer records and loan histories.
- Encode and track active loans and repayments.
- Support operational adjustments such as reversals, deposits, expenses, and collector activity.
- Generate operational and audit-style reports for day-to-day management.
- Preserve continuity of branch operations in an on-premise/shared-network environment.

## Non-Goals
- Public borrower self-service.
- Web or mobile access.
- Real-time API integrations with third-party platforms.
- Fine-grained modern security controls such as SSO, MFA, or centralized secrets management.
- Cloud-native deployment.

## Primary Users
- Teller or encoder
  Records customer, loan, and payment transactions.
- Branch manager or supervisor
  Reviews operations, monitors staff activity, validates reports, and handles exceptions.
- Accounting or finance staff
  Reviews deposits, expenses, balances, and operational reports.
- Admin or power user
  Maintains users, branches, collectors, and troubleshooting tasks.

## Key User Problems
- Staff need a fast workflow for encoding customer, loan, and payment records.
- Lending operations need a consistent source of truth for balances, maturity, and collection activity.
- Managers need reports for released loans, collections, past due accounts, and reversals.
- Staff need support for exceptional cases such as reverse loan, reverse payment, inactive clients, and maturity checking.

## Current Product Scope

### 1. Authentication and Access
- Startup form is `frmLogin`.
- User records are loaded from `tblUser`.
- A user level controls visibility or enabled state for parts of the main workspace.

### 2. Main Workspace
- Main shell is an MDI form.
- Toolbar and menus route staff to operational modules.
- Dashboard-like behavior exists in the main form, including counts and refresh actions.

### 3. Customer Management
- Customer creation, lookup, maintenance, and status handling exist in `frm_Customer`.
- Customer balance and history are tied to loan and payment activity.
- Reversed or inactive customer states are referenced in workflow logic.

### 4. Loan Management
- Loan origination and maintenance are handled in `frm_Loan`.
- Loan attributes include principal, date released, type, interest rate, loan period, maturity, collector linkage, amortization values, charges, service fee, and insurance-related values.
- The form appears to support multiple loan types, including regular and emergency loans.
- Disclosure and statement-related actions are present.

### 5. Payment Management
- Payment entry is handled in `frm_payment`.
- Workflow supports searching by customer, OR number, loan ID, and code.
- Payment logic computes balances, amortization-related values, and encoded payment totals.
- Multiple same-day payments are explicitly handled with warning logic.

### 6. Reversals and Exceptions
- Reverse loan and reverse payment forms exist.
- Change password, validation, and trail-related support forms exist.
- There are modules for past due marking and maturity checking.

### 7. Operational Finance
- Deposit and expense forms exist.
- Cash on hand, chart of accounts, and breakdown-related forms/modules exist.
- Branch maintenance is supported.

### 8. Collector and Field Operations
- Collector maintenance and collector assignment data are present.
- Collection sheet reports and past-due collector reports exist.

### 9. Reporting
- The system includes a large Crystal Reports footprint.
- Reports cover collections, disclosure, collector lists, monthly collections, monthly releases, payments encoded, payments reversed, maturity checks, loan type reporting, and other operational printouts.

## Core User Workflows

### Login and Daily Startup
1. User launches the desktop application.
2. User signs in on the login form.
3. System loads the main MDI workspace.
4. Staff open the needed module from menu or toolbar.

### Encode New Loan
1. Staff locate or confirm customer record.
2. Staff open the loan form.
3. Staff enter loan terms, release date, collector, charges, and related values.
4. System computes amortization and maturity-related values.
5. Staff save the loan.
6. Staff optionally generate disclosure or supporting printouts.

### Encode Payment
1. Staff open the payment form.
2. Staff search for the borrower or loan.
3. System locates the active regular or emergency loan.
4. Staff enter payment amount and OR number.
5. System computes updated balances.
6. Staff save the payment.
7. System updates loan/customer financial state and may trigger late-payment logic.

### Review and Reporting
1. Staff select a report from the main workspace.
2. System opens the related report form or Crystal Report.
3. Staff review, print, or export the result.

### Exception Handling
1. Staff identify a loan or payment issue.
2. Staff use reverse-payment or reverse-loan workflow.
3. System updates status-based records to preserve traceability rather than simple deletion.

## Functional Requirements

### FR-1 Authentication
- The system shall require a username and password before opening the main workspace.
- The system shall retrieve user records from the local/shared database.
- The system shall support at least one user-level distinction that affects menu or toolbar access.

### FR-2 Customer Records
- The system shall create, view, search, and update customer records.
- The system shall associate customers with loans and payment activity.
- The system shall support active, reversed, and inactive-style states where applicable.

### FR-3 Loan Records
- The system shall create and maintain loan records.
- The system shall store loan type, principal, release date, interest-related fields, period, maturity, total amortization, and status.
- The system shall support regular and emergency loan behavior.

### FR-4 Payment Records
- The system shall create payment records tied to a specific loan.
- The system shall store collector, OR number, balance values, amount paid, and status.
- The system shall support more than one payment on the same day with operator confirmation.

### FR-5 Operational Adjustments
- The system shall support loan reversal and payment reversal workflows.
- The system shall support deposits, expenses, cash-on-hand, and related accounting views.

### FR-6 Reporting
- The system shall provide operational reports for loans, collections, past due accounts, maturity checks, deposits, and reversals.
- The system shall support print-friendly reporting through Crystal Reports assets.

### FR-7 Data Access
- The system shall connect to a Microsoft Jet database (`.mdb`) for operational data.
- The system shall load shared tables such as users, customers, loans, payments, branches, collectors, deposits, expenses, and amortization schedules.

## Non-Functional Requirements

### NFR-1 Environment
- The product must run as a Windows desktop application compatible with the VB6 runtime and registered ActiveX/OCX dependencies.

### NFR-2 Database Connectivity
- The product depends on access to a shared database location and local runtime prerequisites.
- The system uses ADO/DAO and must maintain compatibility with Jet/Access-based data access.

### NFR-3 Performance
- Forms should load quickly enough for branch operations on legacy office hardware.
- Common search and transaction-entry workflows should be responsive for daily use.

### NFR-4 Reliability
- The system should tolerate operator mistakes through reversible transaction flows.
- Error logging/reporting should capture enough context for troubleshooting.

### NFR-5 Maintainability
- The current system has low maintainability due to large forms, shared global state, and tightly coupled UI/data logic.
- Any future requirements should prioritize separation of business rules from UI code.

## Dependencies
- Visual Basic 6 runtime/project model.
- `ADODB` / Jet OLEDB.
- DAO library.
- Crystal Reports runtime and viewer components.
- VB6 OCX controls such as `MSADODC`, `MSDATGRD`, `MSCOMCT2`, and `MSCOMCTL`.
- Network/shared storage for the database and report assets.

## Data and Domain Entities
Observed entities include:
- `tblUser`
- `tblCustomer`
- `tblLoan`
- `tblPayment`
- `tblBranch`
- `tblCollector`
- `tblColl_Code`
- `tblColl_Data`
- `tblDeposit`
- `tblExpense`
- `tblCashOnHand`
- `tblCashOnBank`
- `tblCharge`
- `tblBreakdown`
- `tblServicefee`
- `tblChartOfAccounts`
- `tblAmortizationSchedule`
- `tblLogtime`

## Reporting Inventory
Observed reporting areas include:
- Collections
- Disclosure
- CPR
- Daily/period collection reports
- Monthly released loans
- Payments encoded
- Payments reversed
- Loan maturity checker
- Loan type report
- Past due reporting
- Full paid reporting

## Risks and Constraints in Current Implementation
- Hardcoded infrastructure assumptions
  Database and report paths are hardcoded in code and assume a shared network location.
- Embedded database secret
  The Jet database password is present in source code.
- Global mutable recordsets
  Many forms depend on shared global connection/recordset state, increasing coupling and defect risk.
- SQL construction through string concatenation
  User input is directly concatenated into SQL statements.
- Large monolithic forms
  Core forms are several thousand lines each and mix UI, workflow, validation, and persistence logic.
- Legacy runtime dependency
  Deployment depends on VB6-era controls and Crystal Reports components being installed correctly.
- Limited source control hygiene
  The workspace contains copied forms, backups, binaries, and historical artifacts that increase confusion.

## Product Gaps
- No modern audit model or formal authorization model.
- No service/API layer for reuse or integration.
- No automated tests discovered in the codebase.
- No clear environment configuration mechanism.
- No evidence of strong input validation or parameterized queries.
- No clear modular boundary between lending rules and UI actions.

## Success Metrics
For the current legacy product:
- Staff can log in and complete daily branch workflows without system-blocking errors.
- Loans and payments can be encoded accurately and reflected in reports.
- Reversal and reporting functions work consistently.

For future product improvement:
- Reduce transaction defects caused by duplicate or inconsistent state handling.
- Reduce support issues caused by environment-specific setup.
- Improve traceability of business rules around maturity, balances, and late payment handling.
- Shorten time needed to onboard a maintainer to the codebase.

## Recommended Product Roadmap

### Phase 1: Stabilize
- Document all forms, tables, and main workflows.
- Centralize connection settings and environment paths.
- Identify and protect the highest-risk transaction paths: login, loan save, payment save, reversals.
- Remove duplicate dead files from the active maintenance path.

### Phase 2: Secure and Harden
- Replace string-built SQL with parameterized commands where feasible.
- Remove hardcoded secrets from source.
- Add structured logging around critical transactions.
- Define user roles and intended permissions more clearly.

### Phase 3: Modularize
- Extract business rules from major forms into reusable modules/services.
- Separate computation logic for loans, amortization, balances, and past due handling.
- Standardize entity access patterns instead of relying on shared global recordsets.

### Phase 4: Modernize
- Decide whether to:
  - Continue maintaining VB6 with targeted hardening, or
  - Migrate to a modern stack while preserving the current workflow model.
- If migrating, treat this PRD as a baseline for feature parity.

## Open Questions
- What exact roles and permissions should exist beyond the current user-level handling?
- Which reports are mission-critical versus obsolete?
- Which copied forms are active, and which are historical backups only?
- What is the authoritative database schema and deployment location today?
- What branch workflows differ between regular and emergency loans in business terms, not just code paths?
- What backup strategy is actually relied on in production?

## Source Basis
This PRD is based on direct inspection of the following codebase artifacts:
- `Melan Lending V2.vbp`
- `Module\db.bas`
- `Module\mdlCreditScore.bas`
- `Form\frmLogin.frm`
- `Form\brayan MDIForm1.frm`
- `Form\frm_Loan.frm`
- `Form\frm_payment.frm`
- Supporting forms and Crystal Report assets under `Form\` and `Report\`
