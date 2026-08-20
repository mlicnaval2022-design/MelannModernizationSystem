const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  if (req.user) return next();
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'melann_secret', (err, user) => {
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
