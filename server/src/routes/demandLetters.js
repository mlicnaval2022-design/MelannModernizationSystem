const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const DEMAND_TYPES = new Set(['first', 'second', 'third']);
const STATUSES = new Set([
  'Generated',
  'Delivered',
  'Received',
  'For Follow-up',
  'Closed',
  'Pending',
  'Urgent Action Require',
  '2nd Demand on Process'
]);

const todayDateOnly = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const normalizeDemandType = value => {
  const text = String(value || '').trim().toLowerCase();
  if (['1st', 'first'].includes(text)) return 'first';
  if (['2nd', 'second'].includes(text)) return 'second';
  if (['3rd', 'third'].includes(text)) return 'third';
  return '';
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    const demandType = normalizeDemandType(req.query.type || 'first');
    if (!DEMAND_TYPES.has(demandType)) return res.status(400).json({ error: 'Invalid demand type' });

    const rows = await dbAll(`
      SELECT *
      FROM tblDemandLetter
      WHERE demand_type = ?
      ORDER BY date_generated DESC, id DESC
    `, [demandType]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const demandType = normalizeDemandType(req.body.demand_type);
    if (!DEMAND_TYPES.has(demandType)) return res.status(400).json({ error: 'Invalid demand type' });

    const clientName = String(req.body.client_name || '').trim();
    if (!clientName) return res.status(400).json({ error: 'client_name is required' });

    const generatedDate = req.body.date_generated || todayDateOnly();
    const result = await dbRun(`
      INSERT INTO tblDemandLetter (
        demand_type, customer_id, loan_id, loan_code, courier, collector_name,
        client_name, date_generated, date_received, follow_up_date, remarks, status, generated_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      demandType,
      req.body.customer_id || null,
      req.body.loan_id || null,
      req.body.loan_code || '',
      req.body.courier || '',
      req.body.collector_name || '',
      clientName,
      generatedDate,
      req.body.date_received || '',
      req.body.follow_up_date || '',
      req.body.remarks || '',
      req.body.status || 'Pending',
      req.user.id
    ]);

    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
      [req.user.id, req.user.username, 'CREATE', 'DEMAND_LETTER', result.lastID, `${demandType} demand generated for ${clientName}`]
    );

    const row = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [result.lastID]);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const existing = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Demand letter record not found' });

    const nextStatus = req.body.status !== undefined ? String(req.body.status || 'Generated') : existing.status;
    if (nextStatus && !STATUSES.has(nextStatus)) return res.status(400).json({ error: 'Invalid status' });

    await dbRun(`
      UPDATE tblDemandLetter
      SET courier = ?,
          date_received = ?,
          follow_up_date = ?,
          remarks = ?,
          status = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `, [
      req.body.courier !== undefined ? req.body.courier : existing.courier,
      req.body.date_received !== undefined ? req.body.date_received : existing.date_received,
      req.body.follow_up_date !== undefined ? req.body.follow_up_date : existing.follow_up_date,
      req.body.remarks !== undefined ? req.body.remarks : existing.remarks,
      nextStatus || 'Generated',
      req.params.id
    ]);

    const row = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [req.params.id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
