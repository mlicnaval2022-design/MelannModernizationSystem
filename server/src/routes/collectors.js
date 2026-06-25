const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    res.json(await dbAll(`SELECT co.*, b.branch_name, (SELECT COUNT(*) FROM tblLoan l WHERE l.collector_id = co.id AND l.status = 'active') as active_loans FROM tblCollector co LEFT JOIN tblBranch b ON co.branch_id = b.id WHERE co.is_active = 1 ORDER BY co.collector_code`));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const collector = await dbGet(`SELECT co.*, b.branch_name FROM tblCollector co LEFT JOIN tblBranch b ON co.branch_id = b.id WHERE co.id = ?`, [req.params.id]);
    if (!collector) return res.status(404).json({ error: 'Collector not found' });
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id WHERE l.collector_id = ? AND l.status = 'active'`, [req.params.id]);
    res.json({ ...collector, loans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { first_name, last_name, branch_id } = req.body;
    const count = (await dbGet('SELECT COUNT(*) as c FROM tblCollector')).c;
    const collector_code = `COL-${String(count + 1).padStart(4, '0')}`;
    const result = await dbRun(`INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id) VALUES (?,?,?,?)`, [collector_code, first_name, last_name, branch_id]);
    res.status(201).json({ id: result.lastID, collector_code });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { first_name, last_name, branch_id, is_active } = req.body;
    await dbRun(`UPDATE tblCollector SET first_name=?, last_name=?, branch_id=?, is_active=? WHERE id=?`, [first_name, last_name, branch_id, is_active ?? 1, req.params.id]);
    res.json({ message: 'Collector updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
