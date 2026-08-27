const express = require('express');
const { dbAll, dbGet } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET paginated audit trail — admin/manager only
router.get('/', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { module, user_id, date_from, date_to, limit = 200 } = req.query;
    let q = `SELECT l.*, u.full_name as user_full_name FROM tblLogtime l LEFT JOIN tblUser u ON l.user_id = u.id WHERE 1=1`;
    const p = [];
    if (module) { q += ` AND l.module = ?`; p.push(module); }
    if (user_id) { q += ` AND l.user_id = ?`; p.push(user_id); }
    if (date_from) { q += ` AND DATE(l.created_at) >= ?`; p.push(date_from); }
    if (date_to) { q += ` AND DATE(l.created_at) <= ?`; p.push(date_to); }
    q += ` ORDER BY l.created_at DESC LIMIT ?`;
    p.push(parseInt(limit));
    res.json(await dbAll(q, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET distinct modules for filter dropdown
router.get('/modules', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    res.json(await dbAll(`SELECT DISTINCT module FROM tblLogtime ORDER BY module`));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
