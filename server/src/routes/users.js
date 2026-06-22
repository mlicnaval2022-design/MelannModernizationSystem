const express = require('express');
const bcrypt = require('bcryptjs');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

// Change own password — must be before /:id
router.put('/me/password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await dbGet('SELECT * FROM tblUser WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(current_password, user.password)) return res.status(400).json({ error: 'Incorrect current password' });
    const hashed = bcrypt.hashSync(new_password, 10);
    await dbRun(`UPDATE tblUser SET password=?, updated_at=datetime('now') WHERE id=?`, [hashed, req.user.id]);
    res.json({ message: 'Password changed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const users = await dbAll(`SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.is_active, u.created_at, b.branch_name FROM tblUser u LEFT JOIN tblBranch b ON u.branch_id = b.id ORDER BY u.full_name`);
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { username, password, full_name, role, branch_id } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'username, password, full_name required' });
    const hashed = bcrypt.hashSync(password, 10);
    const result = await dbRun(`INSERT INTO tblUser (username, password, full_name, role, branch_id) VALUES (?,?,?,?,?)`, [username, hashed, full_name, role || 'teller', branch_id || null]);
    res.status(201).json({ id: result.lastID });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { full_name, role, branch_id, is_active, password } = req.body;
    if (password) {
      const hashed = bcrypt.hashSync(password, 10);
      await dbRun(`UPDATE tblUser SET full_name=?, role=?, branch_id=?, is_active=?, password=?, updated_at=datetime('now') WHERE id=?`, [full_name, role, branch_id || null, is_active ?? 1, hashed, req.params.id]);
    } else {
      await dbRun(`UPDATE tblUser SET full_name=?, role=?, branch_id=?, is_active=?, updated_at=datetime('now') WHERE id=?`, [full_name, role, branch_id || null, is_active ?? 1, req.params.id]);
    }
    res.json({ message: 'User updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
