export const ACCESS_LEVEL_OPTIONS = [
  { value: 'view', label: 'View Only', description: 'Can open and view records only.' },
  { value: 'input', label: 'Input', description: 'Can view and add new records.' },
  { value: 'edit', label: 'Edit', description: 'Can view and update existing records.' },
  { value: 'crud', label: 'Full Access', description: 'Can create, view, update, and delete records.' },
]

export const ACCESS_MODULES = [
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
]

export const REPORT_TYPE_PERMISSIONS = [
  { key: 'report:collection-report', reportKey: 'collection-report', label: 'Collection Report' },
  { key: 'report:monthly-releases', reportKey: 'monthly-releases', label: 'Releases Report' },
  { key: 'report:past-due', reportKey: 'past-due', label: 'Loans Maturity Checker' },
  { key: 'report:payments-reversed', reportKey: 'payments-reversed', label: 'Payments Reversed' },
  { key: 'report:full-paid', reportKey: 'full-paid', label: 'Fully Paid Loans' },
  { key: 'report:collection-sheet', reportKey: 'collection-sheet', label: 'Collection Sheet' },
  { key: 'report:disclosure-statement', reportKey: 'disclosure-statement', label: 'Disclosure Statement' },
  { key: 'report:aging-report', reportKey: 'aging-report', label: 'Aging Report' },
  { key: 'report:special-accounts', reportKey: 'special-accounts', label: 'Deceased & Written-Off Accounts' },
  { key: 'report:expenses-report', reportKey: 'expenses-report', label: 'Expenses Reports' },
]

export const reportPermissionKey = reportKey => `report:${reportKey}`

const LEGACY_USER_RESTRICTED_PATHS = ['/payments', '/loans', '/deposits', '/transactions', '/cash', '/jcash-migration', '/branches', '/users', '/audit']

export function getModuleForPath(pathname) {
  return [...ACCESS_MODULES]
    .sort((a, b) => b.path.length - a.path.length)
    .find(module => pathname === module.path || (module.path !== '/' && pathname.startsWith(`${module.path}/`)))
}

export function getModulePermission(user, moduleKey) {
  if (!user) return null
  if (user.role === 'admin') return 'crud'
  return user.permissions?.[moduleKey] || null
}

export function hasModuleAccess(user, moduleKey, action = 'view') {
  const level = getModulePermission(user, moduleKey)
  if (!level) return false
  if (action === 'view') return true
  if (action === 'input' || action === 'create') return level === 'input' || level === 'crud'
  if (action === 'edit' || action === 'update') return level === 'edit' || level === 'crud'
  if (action === 'delete' || action === 'crud') return level === 'crud'
  return false
}

export function canAccessPath(user, pathname) {
  if (!user) return false
  if (user.role === 'admin') return true
  const module = getModuleForPath(pathname)
  if (user.permissions) return module ? hasModuleAccess(user, module.key, 'view') : false
  if (user.role === 'user') return !LEGACY_USER_RESTRICTED_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
  return true
}

export function canAccessNavItem(user, navItem) {
  if (!user) return false
  if (user.role === 'admin') return true
  const moduleKey = navItem.moduleKey || getModuleForPath(navItem.path)?.key
  if (user.permissions) return Boolean(moduleKey && hasModuleAccess(user, moduleKey, 'view'))
  return canAccessPath(user, navItem.path)
}
