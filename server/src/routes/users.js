const express = require('express');
const bcrypt = require('bcryptjs');
const { dbAll, dbExec, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { ACCESS_LEVELS, ACCESS_MODULES, REPORT_TYPE_PERMISSIONS } = require('../config/accessModules');
const router = express.Router();

function makeRoleKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
}

async function getActiveRole(roleKey) {
  return dbGet(`SELECT * FROM tblRole WHERE role_key = ? AND status = 'active'`, [roleKey]);
}

function normalizePermissions(permissions) {
  const validModules = new Set([
    ...ACCESS_MODULES.map(item => item.key),
    ...REPORT_TYPE_PERMISSIONS.map(item => item.key),
  ]);
  const byModule = new Map();
  for (const permission of Array.isArray(permissions) ? permissions : []) {
    if (validModules.has(permission.module_key) && ACCESS_LEVELS.includes(permission.access_level)) {
      byModule.set(permission.module_key, permission.access_level);
    }
  }
  const selectedReportTypes = REPORT_TYPE_PERMISSIONS.filter(item => byModule.has(item.key));
  if (selectedReportTypes.length > 0 && !byModule.has('reports')) byModule.set('reports', 'view');
  if (byModule.has('reports') && selectedReportTypes.length === 0) {
    const parentAccess = byModule.get('reports');
    REPORT_TYPE_PERMISSIONS.forEach(item => byModule.set(item.key, parentAccess));
  }
  return [...byModule].map(([module_key, access_level]) => ({ module_key, access_level }));
}

async function replacePermissions(roleId, permissions) {
  await dbRun(`DELETE FROM tblRolePermission WHERE role_id = ?`, [roleId]);
  for (const permission of permissions) {
    await dbRun(`INSERT INTO tblRolePermission (role_id, module_key, access_level) VALUES (?, ?, ?)`, [roleId, permission.module_key, permission.access_level]);
  }
}

router.put('/me/password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    const user = await dbGet('SELECT * FROM tblUser WHERE id = ?', [req.user.id]);
    if (!user || !bcrypt.compareSync(current_password, user.password)) return res.status(400).json({ error: 'Incorrect current password' });
    await dbRun(`UPDATE tblUser SET password=?, updated_at=datetime('now') WHERE id=?`, [bcrypt.hashSync(new_password, 10), req.user.id]);
    res.json({ message: 'Password changed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/access-modules', authenticateToken, requireRole('admin'), (req, res) => {
  res.json({ modules: ACCESS_MODULES, report_types: REPORT_TYPE_PERMISSIONS, access_levels: ACCESS_LEVELS });
});

router.get('/branch-options', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    res.json(await dbAll(`SELECT id, branch_code, branch_name FROM tblBranch WHERE is_active = 1 ORDER BY branch_name`));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/roles', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const roles = await dbAll(
      `SELECT r.id, r.role_key, r.role_name, r.description, r.is_system, r.status, r.created_at,
              COUNT(DISTINCT u.id) AS user_count,
              COUNT(DISTINCT CASE WHEN rp.module_key NOT LIKE 'report:%' THEN rp.module_key END) AS module_count,
              COUNT(DISTINCT CASE WHEN rp.module_key LIKE 'report:%' THEN rp.module_key END) AS report_type_count
       FROM tblRole r
       LEFT JOIN tblUser u ON u.role = r.role_key
       LEFT JOIN tblRolePermission rp ON rp.role_id = r.id
       GROUP BY r.id
       ORDER BY CASE WHEN r.role_key = 'admin' THEN 0 ELSE 1 END, r.role_name`
    );
    const permissions = await dbAll(`SELECT role_id, module_key, access_level FROM tblRolePermission ORDER BY role_id, module_key`);
    const grouped = new Map();
    permissions.forEach(item => {
      if (!grouped.has(item.role_id)) grouped.set(item.role_id, []);
      grouped.get(item.role_id).push({ module_key: item.module_key, access_level: item.access_level });
    });
    res.json(roles.map(role => ({ ...role, permissions: grouped.get(role.id) || [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/roles', authenticateToken, requireRole('admin'), async (req, res) => {
  let transactionStarted = false;
  try {
    const roleName = String(req.body.role_name || '').trim();
    const description = String(req.body.description || '').trim();
    const permissions = normalizePermissions(req.body.permissions);
    const roleKey = makeRoleKey(req.body.role_key || roleName);
    if (!roleName || !roleKey) return res.status(400).json({ error: 'Role name is required.' });
    if (permissions.length === 0) return res.status(400).json({ error: 'Select at least one module for this role.' });
    await dbExec('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;
    const result = await dbRun(
      `INSERT INTO tblRole (role_key, role_name, description, status, created_by, updated_by) VALUES (?, ?, ?, 'active', ?, ?)`,
      [roleKey, roleName, description, req.user.id, req.user.id]
    );
    await replacePermissions(result.lastID, permissions);
    await dbExec('COMMIT');
    transactionStarted = false;
    res.status(201).json({ id: result.lastID, role_key: roleKey });
  } catch (err) {
    if (transactionStarted) await dbExec('ROLLBACK').catch(() => {});
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Role name already exists.' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/roles/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  let transactionStarted = false;
  try {
    const role = await dbGet(`SELECT * FROM tblRole WHERE id = ?`, [req.params.id]);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    const roleName = String(req.body.role_name || '').trim();
    const description = String(req.body.description || '').trim();
    const status = req.body.status === 'inactive' ? 'inactive' : 'active';
    const permissions = normalizePermissions(req.body.permissions);
    if (!roleName) return res.status(400).json({ error: 'Role name is required.' });
    if (role.role_key === 'admin' && status !== 'active') return res.status(400).json({ error: 'Administrator role cannot be deactivated.' });
    if (permissions.length === 0) return res.status(400).json({ error: 'Select at least one module for this role.' });
    await dbExec('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;
    await dbRun(
      `UPDATE tblRole SET role_name=?, description=?, status=?, updated_by=?, updated_at=datetime('now') WHERE id=?`,
      [roleName, description, status, req.user.id, role.id]
    );
    await replacePermissions(role.id, permissions);
    await dbExec('COMMIT');
    transactionStarted = false;
    res.json({ message: 'Role updated.' });
  } catch (err) {
    if (transactionStarted) await dbExec('ROLLBACK').catch(() => {});
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Role name already exists.' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/roles/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const role = await dbGet(`SELECT * FROM tblRole WHERE id = ?`, [req.params.id]);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    if (role.is_system || role.role_key === 'admin') return res.status(400).json({ error: 'System roles cannot be deleted.' });
    const usage = await dbGet(`SELECT COUNT(*) AS count FROM tblUser WHERE role = ?`, [role.role_key]);
    if (usage.count > 0) return res.status(400).json({ error: 'This role is assigned to users and cannot be deleted.' });
    await dbRun(`DELETE FROM tblRole WHERE id = ?`, [role.id]);
    res.json({ message: 'Role deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const users = await dbAll(
      `SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.is_active, u.created_at,
              b.branch_name, COALESCE(r.role_name, u.role) AS role_name, r.description AS role_description
       FROM tblUser u
       LEFT JOIN tblBranch b ON u.branch_id = b.id
       LEFT JOIN tblRole r ON r.role_key = u.role
       ORDER BY u.full_name`
    );
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { username, password, full_name, role, branch_id } = req.body;
    if (!username || !password || !full_name || !role) return res.status(400).json({ error: 'Username, password, full name, and role are required.' });
    if (!await getActiveRole(role)) return res.status(400).json({ error: 'Select a valid active role.' });
    const result = await dbRun(
      `INSERT INTO tblUser (username, password, full_name, role, branch_id) VALUES (?,?,?,?,?)`,
      [String(username).trim(), bcrypt.hashSync(password, 10), String(full_name).trim(), role, branch_id || null]
    );
    res.status(201).json({ id: result.lastID });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists.' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { full_name, role, branch_id, is_active, password } = req.body;
    if (!full_name || !await getActiveRole(role)) return res.status(400).json({ error: 'Full name and a valid active role are required.' });
    if (Number(req.params.id) === Number(req.user.id) && Number(is_active) === 0) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    const values = [String(full_name).trim(), role, branch_id || null, is_active ?? 1];
    if (password) {
      values.push(bcrypt.hashSync(password, 10), req.params.id);
      await dbRun(`UPDATE tblUser SET full_name=?, role=?, branch_id=?, is_active=?, password=?, updated_at=datetime('now') WHERE id=?`, values);
    } else {
      values.push(req.params.id);
      await dbRun(`UPDATE tblUser SET full_name=?, role=?, branch_id=?, is_active=?, updated_at=datetime('now') WHERE id=?`, values);
    }
    res.json({ message: 'User updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
