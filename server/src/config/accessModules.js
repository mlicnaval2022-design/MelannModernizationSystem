const ACCESS_LEVELS = ['view', 'input', 'edit', 'crud'];

const ACCESS_MODULES = [
  { key: 'dashboard', label: 'Dashboard', path: '/', section: 'Main' },
  { key: 'customers', label: 'Customers', path: '/customers', section: 'Operations' },
  { key: 'credit-scoring', label: 'Credit Scoring', path: '/credit-scoring', section: 'Operations' },
  { key: 'loans', label: 'Loans', path: '/loans', section: 'Operations' },
  { key: 'promissory-disclosure', label: 'For Print', path: '/promissory-disclosure', section: 'Operations' },
  { key: 'payments', label: 'Encode Payments', path: '/payments', section: 'Operations' },
  { key: 'collectors', label: 'Collectors', path: '/collectors', section: 'Operations' },
  { key: 'monitoring', label: '3-Day Monitoring', path: '/monitoring', section: 'Monitoring' },
  { key: 'ptp-monitoring', label: 'Promise to Pay', path: '/ptp-monitoring', section: 'Monitoring' },
  { key: 'demand-letter', label: 'Demand Letter', path: '/demand-letter', section: 'Monitoring' },
  { key: 'deposits', label: 'Deposits', path: '/deposits', section: 'Finance' },
  { key: 'transactions', label: 'Transactions', path: '/transactions', section: 'Finance' },
  { key: 'dcr', label: 'Daily Cash Report', path: '/dcr', section: 'Finance' },
  { key: 'cash', label: 'Cash Position', path: '/cash', section: 'Finance' },
  { key: 'reports', label: 'Reports', path: '/reports', section: 'Reports' },
  { key: 'collector-performance', label: 'Collector Performance', path: '/collector-performance', section: 'Reports' },
  { key: 'government-compliance', label: 'Government Compliance', path: '/government-compliance', section: 'Reports' },
  { key: 'jcash-migration', label: 'JCash Migration', path: '/jcash-migration', section: 'Admin' },
  { key: 'branches', label: 'Branches', path: '/branches', section: 'Admin' },
  { key: 'user-management', label: 'User Management', path: '/users', section: 'Admin' },
  { key: 'audit', label: 'Audit Trail', path: '/audit', section: 'Admin' },
];

const REPORT_TYPE_PERMISSIONS = [
  { key: 'report:collection-report', report_key: 'collection-report', label: 'Collection Report' },
  { key: 'report:monthly-releases', report_key: 'monthly-releases', label: 'Releases Report' },
  { key: 'report:past-due', report_key: 'past-due', label: 'Loans Maturity Checker' },
  { key: 'report:payments-reversed', report_key: 'payments-reversed', label: 'Payments Reversed' },
  { key: 'report:full-paid', report_key: 'full-paid', label: 'Fully Paid Loans' },
  { key: 'report:collection-sheet', report_key: 'collection-sheet', label: 'Collection Sheet' },
  { key: 'report:disclosure-statement', report_key: 'disclosure-statement', label: 'Disclosure Statement' },
  { key: 'report:aging-report', report_key: 'aging-report', label: 'Aging Report' },
  { key: 'report:expenses-report', report_key: 'expenses-report', label: 'Expenses Reports' },
];

const ACCESS_LEVEL_RANK = { view: 1, input: 2, edit: 2, crud: 3 };

function canUseMethod(accessLevel, method) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) return ACCESS_LEVELS.includes(accessLevel);
  if (normalizedMethod === 'POST') return accessLevel === 'input' || accessLevel === 'crud';
  if (normalizedMethod === 'PUT' || normalizedMethod === 'PATCH') return accessLevel === 'edit' || accessLevel === 'crud';
  if (normalizedMethod === 'DELETE') return accessLevel === 'crud';
  return false;
}

module.exports = { ACCESS_LEVELS, ACCESS_MODULES, REPORT_TYPE_PERMISSIONS, ACCESS_LEVEL_RANK, canUseMethod };
