# Melann Lending System V2 — Modernized

A full-stack web application modernizing the legacy VB6 **Melann Lending System V2** into a React + Node.js + SQLite platform.

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ installed
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

## 🔑 Demo Login Credentials

| Username    | Password       | Role        | Access                          |
|-------------|----------------|-------------|----------------------------------|
| admin       | admin123       | Admin       | Full access including user mgmt |
| manager     | manager123     | Manager     | Operations + reports + reversals|
| teller      | teller123      | Teller      | Customers, loans, payments      |
| accounting  | accounting123  | Accounting  | Finance, deposits, expenses     |

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
PORT=5001
JWT_SECRET=melann_lending_secret_key_2026
DB_PATH=./melann.db
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
