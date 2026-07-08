const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { date_from, date_to, branch_id, type } = req.query;
    let q = `SELECT t.*, b.branch_name FROM tblTransaction t LEFT JOIN tblBranch b ON t.branch_id = b.id WHERE t.status = 'active'`;
    const p = [];
    if (date_from) { q += ` AND t.transaction_date >= ?`; p.push(date_from); }
    if (date_to) { q += ` AND t.transaction_date <= ?`; p.push(date_to); }
    if (branch_id) { q += ` AND t.branch_id = ?`; p.push(branch_id); }
    if (type) { q += ` AND t.transaction_type = ?`; p.push(type); }
    q += ` ORDER BY t.transaction_date DESC`;
    res.json(await dbAll(q, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { branch_id, transaction_date, amount, transaction_type, category, description, payee } = req.body;
    const result = await dbRun(`INSERT INTO tblTransaction (branch_id, transaction_date, amount, transaction_type, category, description, payee, created_by) VALUES (?,?,?,?,?,?,?,?)`, 
      [branch_id, transaction_date, amount, transaction_type || 'Expense', category, description, payee, req.user.id]);
    res.status(201).json({ id: result.lastID });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { branch_id, transaction_date, amount, transaction_type, category, description, payee } = req.body;
    await dbRun(`UPDATE tblTransaction SET branch_id=?, transaction_date=?, amount=?, transaction_type=?, category=?, description=?, payee=? WHERE id=?`, 
      [branch_id, transaction_date, amount, transaction_type || 'Expense', category, description, payee, req.params.id]);
    res.json({ message: 'Transaction updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await dbRun(`UPDATE tblTransaction SET status='voided' WHERE id=?`, [req.params.id]);
    res.json({ message: 'Transaction voided' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
