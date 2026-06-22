const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/hand', authenticateToken, async (req, res) => {
  try { res.json(await dbAll(`SELECT c.*, b.branch_name FROM tblCashOnHand c LEFT JOIN tblBranch b ON c.branch_id = b.id ORDER BY c.entry_date DESC LIMIT 30`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/hand', authenticateToken, async (req, res) => {
  try {
    const { branch_id, entry_date, opening_balance, total_collections, total_releases, total_expenses } = req.body;
    const closing = (opening_balance || 0) + (total_collections || 0) - (total_releases || 0) - (total_expenses || 0);
    const result = await dbRun(`INSERT INTO tblCashOnHand (branch_id, entry_date, opening_balance, total_collections, total_releases, total_expenses, closing_balance, created_by) VALUES (?,?,?,?,?,?,?,?)`, [branch_id, entry_date, opening_balance || 0, total_collections || 0, total_releases || 0, total_expenses || 0, closing, req.user.id]);
    res.status(201).json({ id: result.lastID, closing_balance: closing });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/bank', authenticateToken, async (req, res) => {
  try { res.json(await dbAll(`SELECT c.*, b.branch_name FROM tblCashOnBank c LEFT JOIN tblBranch b ON c.branch_id = b.id ORDER BY c.entry_date DESC LIMIT 30`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bank', authenticateToken, async (req, res) => {
  try {
    const { branch_id, bank_name, account_number, entry_date, amount, transaction_type, reference_no } = req.body;
    const result = await dbRun(`INSERT INTO tblCashOnBank (branch_id, bank_name, account_number, entry_date, amount, transaction_type, reference_no, created_by) VALUES (?,?,?,?,?,?,?,?)`, [branch_id, bank_name, account_number, entry_date, amount, transaction_type, reference_no, req.user.id]);
    res.status(201).json({ id: result.lastID });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
