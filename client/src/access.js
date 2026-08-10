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
  '/branches',
  '/users',
  '/audit',
  '/monitoring-settings',
]

export function isUserRestrictedPath(pathname) {
  return USER_RESTRICTED_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

export function canAccessPath(user, pathname) {
  if (!user) return false
  if (user.role === 'admin') return true
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
