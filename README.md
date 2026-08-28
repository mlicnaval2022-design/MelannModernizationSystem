# Melann Lending System V2 — Modernized

A full-stack web application modernizing the legacy VB6 **Melann Lending System V2** into a React + Node.js + SQLite platform.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 22.12 or newer installed (Node.js 24 recommended)
- No other software required

### First-Time Setup
```bash
# From the project root
npm run install:all
```

### Starting the System (Two terminals)

**Terminal 1 — Backend Server (Port 5001)**
```bash
cd server
npm run dev
```

**Terminal 2 — Frontend Client (Port 5173)**
```bash
cd client
npm run dev
```

Then open your browser at: **http://localhost:5173**

---

## JCash Good Status Import

The Access source database is opened read-only. The importer filters loans to Good / Good Status, date released from `2016-01-01` to `2026-06-24`, positive existing loan balance, and excludes `Fully Paid`, `Paid`, `Reversed`, and `Reversing`. Payments are imported only when their payment status is Good / Good Status and they belong to one of the matched loans.

Dry run:

```powershell
$env:JCASH_MDB_PASSWORD='your-access-password'
npm.cmd run import:jcash --prefix server -- --dry-run
```

Import:

```powershell
$env:JCASH_MDB_PASSWORD='your-access-password'
npm.cmd run import:jcash --prefix server
```

Optional path/date overrides:

```powershell
npm.cmd run import:jcash --prefix server -- --source "\\SERVERPC\LendingV2Melan\db\jcashdb.mdb" --from 2016-01-01 --to 2026-06-24
```

---

## 📁 Project Structure

```
ModernizationMelannSystem/
├── server/                     # Node.js + Express REST API
│   ├── src/
│   │   ├── db/
│   │   │   └── database.js     # SQLite init (18 tables)
│   │   ├── middleware/
│   │   │   ├── auth.js         # JWT authentication
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js         # Login/logout
│   │   │   ├── customers.js    # Customer CRUD
│   │   │   ├── loans.js        # Loan origination + amortization
│   │   │   ├── payments.js     # Payment encoding
│   │   │   ├── collectors.js
│   │   │   ├── branches.js
│   │   │   ├── deposits.js
│   │   │   ├── expenses.js
│   │   │   ├── cash.js         # Cash on Hand / Bank
│   │   │   ├── reversals.js    # Loan + payment reversals
│   │   │   ├── reports.js      # 9 report types
│   │   │   ├── audit.js        # Audit trail
│   │   │   └── users.js        # User management
│   │   ├── services/
│   │   │   ├── loanCalculator.js    # Amortization business logic
│   │   │   ├── pastDueUpdater.js    # Auto past-due scheduler
│   │   │   └── auditLogger.js       # tblLogtime writer
│   │   └── index.js            # Express app entry point
│   ├── melann.db               # SQLite database (auto-created)
│   └── .env                    # Environment config
│
├── client/                     # React + Vite frontend
│   └── src/
│       ├── components/
│       │   └── Layout.jsx      # Sidebar + topbar + change-password
│       ├── context/
│       │   └── AuthContext.jsx # JWT auth state
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Customers.jsx
│       │   ├── Loans.jsx       # + Amortization Schedule tab
│       │   ├── Payments.jsx
│       │   ├── Collectors.jsx
│       │   ├── Deposits.jsx
│       │   ├── Expenses.jsx
│       │   ├── CashPosition.jsx
│       │   ├── Reports.jsx     # 9 report types
│       │   ├── Branches.jsx
│       │   ├── AuditTrail.jsx
│       │   └── Users.jsx
│       ├── services/
│       │   └── api.js          # Axios client (auto-JWT)
│       └── index.css           # Fintech dark theme design system
│
└── CODEBASE_PRD.md             # Original product requirements
```

---

## 🗄️ Database Tables (18)

| Table                  | Description                         |
|------------------------|-------------------------------------|
| tblUser                | System users + roles                |
| tblBranch              | Branch offices                      |
| tblCollector           | Field collectors                    |
| tblColl_Code           | Collector route codes               |
| tblColl_Data           | Collector-loan assignments          |
| tblCustomer            | Borrower profiles                   |
| tblLoan                | Loan accounts + amortization values |
| tblAmortizationSchedule| Per-period payment schedule         |
| tblPayment             | Payment records                     |
| tblDeposit             | Branch cash deposits                |
| tblExpense             | Operational expenses                |
| tblCashOnHand          | Daily cash-on-hand entries          |
| tblCashOnBank          | Bank account transactions           |
| tblCharge              | Loan charges                        |
| tblBreakdown           | Loan fee breakdown                  |
| tblServicefee          | Service fee rate config             |
| tblChartOfAccounts     | Chart of accounts                   |
| tblLogtime             | Full audit trail                    |

---

## 📊 Available Reports

1. **Daily Collection** — All payments in a date range
2. **Monthly Releases** — Loans released in a month
3. **Past Due Report** — Overdue loans with days overdue
4. **Payments Encoded** — Encoded payments by date
5. **Payments Reversed** — Reversed payments audit
6. **Maturity Checker** — Loans maturing within N days
7. **Full Paid Loans** — Completed loan accounts
8. **Loan Type Summary** — Portfolio breakdown by type/status
9. **Collection Sheet** — Per-collector active loan list (printable)

---

## ⚙️ Environment Config (server/.env)

```env
NODE_ENV=production
PORT=5001
JWT_SECRET=<unique-random-secret-at-least-32-characters>
INITIAL_ADMIN_PASSWORD=<temporary-strong-password-at-least-12-characters>
DB_PATH=./melann.db
CORS_ORIGINS=https://melann.example.com
TRUST_PROXY=1
ENFORCE_HTTPS=true
HOST=127.0.0.1
```

`INITIAL_ADMIN_PASSWORD` is used only to create or rotate an administrator that still has the legacy default password. Remove it from the environment after the first successful production start and change the password through User Management.

Production traffic must be terminated with HTTPS by the branch server or reverse proxy. The Node server binds to loopback by default, trusts one proxy hop, and rejects plain HTTP requests unless `ENFORCE_HTTPS=false` is explicitly set for a controlled local check. The client uses same-origin `/api`; the Vite development server proxies it to port 5001. Set `VITE_API_BASE_URL=https://your-domain.example.com/api` only when the API is served from a different HTTPS origin.

### Release Verification

Before moving a build to a branch/server, run:

```bash
npm run verify:release
```

This runs production dependency audits, the server test suite, client lint, client unit/component tests, and the production frontend build.

Run destructive CRUD verification only against an isolated staging database or a copied backup:

```bash
DB_PATH=./staging-release-check.sqlite npm run verify:release
```

Do not run destructive create/update/delete checks directly against the live company database. Create a backup first, rehearse against the copy, then deploy the verified build to the live server.

On the branch server, validate the configured database without modifying records:

```bash
npm run verify:database
```

This performs SQLite integrity, foreign-key, and required-schema checks in read-only mode.

Rehearse the newest database backup by copying it to an isolated temporary
location and running the same integrity checks:

```bash
npm run verify:restore
```

### Secure LAN HTTPS

Production LAN deployments use a branch-specific HTTPS certificate and fail
closed when neither a TLS certificate nor a trusted HTTPS reverse proxy is
configured. Run `CONFIGURE_HTTPS.ps1` after assigning the server its final
computer name and fixed IP address. Distribute the generated secure client
installer so each client trusts only that branch's public certificate.

To create a fresh deployment ZIP containing the current features but no
database, customer records, uploads, backups, secrets, or private keys:

```bash
npm run package:blank
```

---

## 🔒 Role Permissions

| Feature              | Admin | Manager | Teller | Accounting |
|----------------------|-------|---------|--------|------------|
| Customer CRUD        | ✅    | ✅      | ✅     | 👁️         |
| Loan Create          | ✅    | ✅      | ✅     | 👁️         |
| Payment Encode       | ✅    | ✅      | ✅     | 👁️         |
| Reverse Loan/Payment | ✅    | ✅      | ❌     | ❌         |
| Deposits/Expenses    | ✅    | ✅      | ✅     | ✅         |
| Reports              | ✅    | ✅      | ✅     | ✅         |
| User Management      | ✅    | ❌      | ❌     | ❌         |
| Audit Trail          | ✅    | ✅      | ❌     | ❌         |
| Branches             | ✅    | ✅      | ❌     | ❌         |

---

## 🖨️ Print / Export Reports

All report pages include a **🖨️ Print** button that opens the browser print dialog. The CSS includes full print media rules that hide the sidebar and toolbar, producing a clean printable output.
