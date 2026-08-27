const { dbAll } = require('../db/database');
const { ACCESS_LEVEL_RANK, canUseMethod } = require('../config/accessModules');

function authorizeModule(...moduleKeys) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
      if (moduleKeys.includes('user-management') && req.path === '/me/password') return next();
      if (req.user.role === 'admin') {
        req.modulePermission = { module_key: moduleKeys[0], access_level: 'crud' };
        return next();
      }

      const placeholders = moduleKeys.map(() => '?').join(', ');
      const permissions = await dbAll(
        `SELECT rp.module_key, rp.access_level
         FROM tblRolePermission rp
         JOIN tblRole r ON r.id = rp.role_id
         WHERE r.role_key = ? AND r.status = 'active' AND rp.module_key IN (${placeholders})`,
        [req.user.role, ...moduleKeys]
      );
      const permission = permissions
        .filter((item) => canUseMethod(item.access_level, req.method))
        .sort(
          (a, b) => (ACCESS_LEVEL_RANK[b.access_level] || 0) - (ACCESS_LEVEL_RANK[a.access_level] || 0)
        )[0];

      if (!permission) {
        return res.status(403).json({ error: 'Your role does not have permission for this action.' });
      }
      req.modulePermission = permission;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Use this for exceptional module operations (for example, changing system
// settings or starting a system-wide scan).  The parent route registration
// has already resolved the caller's module permission in `authorizeModule`;
// keeping the check here prevents individual features from falling back to a
// hard-coded role name such as "admin".
function requireModuleAccess(accessLevel = 'crud') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.modulePermission?.access_level === 'crud') return next();
    return res.status(403).json({ error: 'Full Access is required for this action.' });
  };
}

module.exports = { authorizeModule, requireModuleAccess };
