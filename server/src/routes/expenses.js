const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { date_from, date_to, branch_id } = req.query;
    let q = `SELECT e.*, b.branch_name FROM tblExpense e LEFT JOIN tblBranch b ON e.branch_id = b.id WHERE e.status = 'active'`;
    const p = [];
    if (date_from) { q += ` AND e.expense_date >= ?`; p.push(date_from); }
    if (date_to) { q += ` AND e.expense_date <= ?`; p.push(date_to); }
    if (branch_id) { q += ` AND e.branch_id = ?`; p.push(branch_id); }
    q += ` ORDER BY e.expense_date DESC`;
    res.json(await dbAll(q, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { branch_id, expense_date, amount, category, description, payee } = req.body;
    const result = await dbRun(`INSERT INTO tblExpense (branch_id, expense_date, amount, category, description, payee, created_by) VALUES (?,?,?,?,?,?,?)`, [branch_id, expense_date, amount, category, description, payee, req.user.id]);
    res.status(201).json({ id: result.lastID });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await dbRun(`UPDATE tblExpense SET status='voided' WHERE id=?`, [req.params.id]);
    res.json({ message: 'Expense voided' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
