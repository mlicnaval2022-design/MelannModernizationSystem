const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) return decodeURIComponent(cookie.slice(separator + 1).trim());
  }
  return null;
}

function authenticateToken(req, res, next) {
  if (req.user) return next();
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || readCookie(req, 'melann_token');

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, getJwtSecret(), (err, user) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    // Module routes are first evaluated by authorizeModule. A role with Full
    // Access has already passed the module/action check and must not lose a
    // newly added feature merely because its role name is not listed here.
    if (req.modulePermission?.access_level === 'crud') return next();
    if (!roles.includes(req.user.role) && !req.modulePermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole };
