const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { date_from, date_to, branch_id } = req.query;
    let q = `SELECT d.*, b.branch_name FROM tblDeposit d LEFT JOIN tblBranch b ON d.branch_id = b.id WHERE d.status = 'active'`;
    const p = [];
    if (date_from) { q += ` AND d.deposit_date >= ?`; p.push(date_from); }
    if (date_to) { q += ` AND d.deposit_date <= ?`; p.push(date_to); }
    if (branch_id) { q += ` AND d.branch_id = ?`; p.push(branch_id); }
    q += ` ORDER BY d.deposit_date DESC`;
    res.json(await dbAll(q, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { branch_id, deposit_date, amount, bank_name, reference_no, deposited_by, remarks } = req.body;
    const result = await dbRun(`INSERT INTO tblDeposit (branch_id, deposit_date, amount, bank_name, reference_no, deposited_by, remarks, created_by) VALUES (?,?,?,?,?,?,?,?)`, [branch_id, deposit_date, amount, bank_name, reference_no, deposited_by, remarks, req.user.id]);
    res.status(201).json({ id: result.lastID });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await dbRun(`UPDATE tblDeposit SET status='voided' WHERE id=?`, [req.params.id]);
    res.json({ message: 'Deposit voided' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
