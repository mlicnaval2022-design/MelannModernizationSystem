export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
]

export const USER_RESTRICTED_PATHS = [
  '/payments',
  '/loans',
  '/deposits',
  '/transactions',
  '/cash',
  '/jcash-migration',
  '/branches',
  '/users',
  '/audit',
  '/monitoring-settings',
]

export const PATH_ROLE_RULES = [
  { path: '/jcash-migration', roles: ['admin', 'manager'] },
]

export function isUserRestrictedPath(pathname) {
  return USER_RESTRICTED_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

export function getPathRoleRule(pathname) {
  return PATH_ROLE_RULES.find(rule => pathname === rule.path || pathname.startsWith(`${rule.path}/`))
}

export function canAccessPath(user, pathname) {
  if (!user) return false
  if (user.role === 'admin') return true
  const pathRule = getPathRoleRule(pathname)
  if (pathRule) return pathRule.roles.includes(user.role)
  if (user.role === 'user' && isUserRestrictedPath(pathname)) return false
  return true
}

export function canAccessNavItem(user, navItem) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role === 'user' && isUserRestrictedPath(navItem.path)) return false
  return !navItem.roles || navItem.roles.includes(user.role)
}

export function normalizeManagedRole(role) {
  return ROLE_OPTIONS.some(option => option.value === role) ? role : 'user'
}
