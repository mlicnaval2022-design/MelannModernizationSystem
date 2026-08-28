const { authorizeModule } = require('./permissions');

function permissionKeysForReportPath(pathname) {
  if (/^\/expenses(?:\/|$)/.test(pathname)) return ['report:expenses-report'];
  if (/^\/collection-sheet\/(?:field-releases|advance-client|advance-manual|config)(?:\/|$)/.test(pathname)) {
    return ['report:collection-sheet'];
  }

  const routePermissions = {
    '/daily-collection': ['report:collection-report'],
    '/monthly-releases': ['report:monthly-releases'],
    '/release-report': ['report:monthly-releases'],
    '/past-due': ['report:past-due'],
    '/maturity-check': ['report:past-due'],
    '/payments-reversed': ['report:payments-reversed'],
    '/full-paid': ['report:full-paid'],
    '/collection-sheet': ['report:collection-sheet'],
    '/disclosure-statement': ['report:disclosure-statement'],
    '/aging-report': ['report:aging-report'],
    '/special-accounts': ['report:special-accounts'],
  };
  return routePermissions[pathname] || null;
}

function authorizeReportType(req, res, next) {
  const permissionKeys = permissionKeysForReportPath(req.path);
  if (!permissionKeys) return next();
  return authorizeModule(...permissionKeys)(req, res, next);
}

module.exports = { authorizeReportType, permissionKeysForReportPath };
