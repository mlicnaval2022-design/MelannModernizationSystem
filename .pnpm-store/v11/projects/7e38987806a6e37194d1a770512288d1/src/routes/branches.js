const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try { res.json(await dbAll('SELECT * FROM tblBranch WHERE is_active = 1 ORDER BY branch_name')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { branch_code, branch_name, address, contact } = req.body;
    const result = await dbRun(`INSERT INTO tblBranch (branch_code, branch_name, address, contact) VALUES (?,?,?,?)`, [branch_code, branch_name, address, contact]);
    res.status(201).json({ id: result.lastID });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { branch_name, address, contact, is_active } = req.body;
    await dbRun(`UPDATE tblBranch SET branch_name=?, address=?, contact=?, is_active=? WHERE id=?`, [branch_name, address, contact, is_active ?? 1, req.params.id]);
    res.json({ message: 'Branch updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
