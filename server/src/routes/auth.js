const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

async function buildUserPayload(user) {
  const role = await dbGet(
    `SELECT role_name, description FROM tblRole WHERE role_key = ? AND status = 'active'`,
    [user.role]
  );
  const permissionRows = await dbAll(
    `SELECT rp.module_key, rp.access_level
     FROM tblRolePermission rp
     JOIN tblRole r ON r.id = rp.role_id
     WHERE r.role_key = ? AND r.status = 'active'`,
    [user.role]
  );
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    role_name: role?.role_name || user.role,
    role_description: role?.description || '',
    branch_id: user.branch_id,
    permissions: Object.fromEntries(permissionRows.map(item => [item.module_key, item.access_level])),
  };
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    const user = await dbGet('SELECT * FROM tblUser WHERE username = ? AND is_active = 1', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid username or password' });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name, branch_id: user.branch_id },
      process.env.JWT_SECRET || 'melann_secret', { expiresIn: '12h' }
    );
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, details) VALUES (?,?,?,?,?)`, [user.id, user.username, 'LOGIN', 'AUTH', 'User logged in']);
    res.json({ token, user: await buildUserPayload(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await dbGet(`SELECT * FROM tblUser WHERE id = ? AND is_active = 1`, [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found or inactive' });
    res.json(await buildUserPayload(user));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/logout', (req, res) => res.json({ message: 'Logged out' }));

module.exports = router;
