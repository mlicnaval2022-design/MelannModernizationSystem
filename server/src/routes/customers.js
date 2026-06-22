const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, status, branch_id } = req.query;
    let q = `SELECT c.*, b.branch_name, co.first_name || ' ' || co.last_name as collector_name FROM tblCustomer c LEFT JOIN tblBranch b ON c.branch_id = b.id LEFT JOIN tblCollector co ON c.collector_id = co.id WHERE 1=1`;
    const p = [];
    if (search) { q += ` AND (c.full_name LIKE ? OR c.customer_code LIKE ? OR c.contact LIKE ?)`; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { q += ` AND c.status = ?`; p.push(status); }
    if (branch_id) { q += ` AND c.branch_id = ?`; p.push(branch_id); }
    q += ` ORDER BY c.last_name, c.first_name`;
    res.json(await dbAll(q, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const customer = await dbGet(`SELECT c.*, b.branch_name, co.first_name || ' ' || co.last_name as collector_name FROM tblCustomer c LEFT JOIN tblBranch b ON c.branch_id = b.id LEFT JOIN tblCollector co ON c.collector_id = co.id WHERE c.id = ?`, [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const loans = await dbAll(`SELECT * FROM tblLoan WHERE customer_id = ? ORDER BY created_at DESC`, [req.params.id]);
    res.json({ ...customer, loans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, middle_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    const count = (await dbGet('SELECT COUNT(*) as c FROM tblCustomer')).c;
    const customer_code = `CUS-${String(count + 1).padStart(5, '0')}`;
    const result = await dbRun(`INSERT INTO tblCustomer (customer_code, first_name, last_name, middle_name, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active')`, [customer_code, first_name, last_name, middle_name || null, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'CREATE', 'CUSTOMER', result.lastID, `Created: ${full_name}`]);
    res.status(201).json({ id: result.lastID, customer_code, full_name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, middle_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status } = req.body;
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    await dbRun(`UPDATE tblCustomer SET first_name=?, last_name=?, middle_name=?, full_name=?, address=?, contact=?, birth_date=?, civil_status=?, occupation=?, branch_id=?, collector_id=?, status=?, updated_at=datetime('now') WHERE id=?`, [first_name, last_name, middle_name, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status || 'active', req.params.id]);
    res.json({ message: 'Customer updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    await dbRun(`UPDATE tblCustomer SET status='inactive', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    res.json({ message: 'Customer deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
