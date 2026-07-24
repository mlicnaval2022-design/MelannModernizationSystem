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
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name, c.customer_code FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id WHERE l.collector_id = ? AND l.status = 'active' ORDER BY c.full_name ASC`, [req.params.id]);
    res.json({ ...collector, loans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { first_name, last_name, branch_id, assigned_to, supervisor } = req.body;
    const maxCol = await dbGet("SELECT MAX(CAST(REPLACE(collector_code, 'COL-', '') AS INTEGER)) as c FROM tblCollector");
    const collector_code = `COL-${String((maxCol?.c || 0) + 1).padStart(4, '0')}`;
    const result = await dbRun(`INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, assigned_to, supervisor) VALUES (?,?,?,?,?,?)`, [collector_code, first_name, last_name, branch_id, assigned_to, supervisor]);
    res.status(201).json({ id: result.lastID, collector_code });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { first_name, last_name, branch_id, assigned_to, supervisor, is_active } = req.body;
    await dbRun(`UPDATE tblCollector SET first_name=?, last_name=?, branch_id=?, assigned_to=?, supervisor=?, is_active=? WHERE id=?`, [first_name, last_name, branch_id, assigned_to, supervisor, is_active ?? 1, req.params.id]);
    res.json({ message: 'Collector updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/assign-loan', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { loan_id, new_collector_id } = req.body;
    if (!loan_id || !new_collector_id) return res.status(400).json({ error: 'Missing parameters' });
    
    const loan = await dbGet('SELECT customer_id FROM tblLoan WHERE id = ?', [loan_id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    
    await dbRun(`UPDATE tblLoan SET collector_id = ? WHERE id = ?`, [new_collector_id, loan_id]);
    await dbRun(`UPDATE tblCustomer SET collector_id = ? WHERE id = ?`, [new_collector_id, loan.customer_id]);
    
    res.json({ message: 'Collector assigned successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const activeLoans = (await dbGet(`SELECT COUNT(*) as count FROM tblLoan WHERE collector_id = ? AND status = 'active'`, [req.params.id])).count;
    if (activeLoans > 0) return res.status(400).json({ error: 'Cannot delete collector with active loans. Please reassign them first.' });
    
    await dbRun(`UPDATE tblCollector SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Collector deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
