const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

const OPTION_TYPES = new Set(['assigned_area', 'supervisor']);

const normalizeOption = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const optionPayload = async () => {
  const options = await dbAll(`
    SELECT id, option_type, option_name, is_active, created_at, updated_at
    FROM tblCollectorOption
    ORDER BY option_type, is_active DESC, option_name COLLATE NOCASE
  `);
  return {
    assigned_areas: options.filter(option => option.option_type === 'assigned_area'),
    supervisors: options.filter(option => option.option_type === 'supervisor'),
  };
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    res.json(await dbAll(`SELECT co.*, b.branch_name, (SELECT COUNT(*) FROM tblLoan l WHERE l.collector_id = co.id AND l.status = 'active') as active_loans FROM tblCollector co LEFT JOIN tblBranch b ON co.branch_id = b.id WHERE co.is_active = 1 ORDER BY co.collector_code`));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/options', authenticateToken, async (req, res) => {
  try {
    res.json(await optionPayload());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/options', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const optionType = String(req.body.option_type || '').trim();
    const optionName = normalizeOption(req.body.option_name);
    if (!OPTION_TYPES.has(optionType)) return res.status(400).json({ error: 'Invalid collector option type' });
    if (!optionName) return res.status(400).json({ error: 'Option name is required' });
    if (optionName.length > 100) return res.status(400).json({ error: 'Option name must not exceed 100 characters' });

    const existing = await dbGet(
      `SELECT id, is_active FROM tblCollectorOption WHERE option_type = ? AND option_name = ? COLLATE NOCASE`,
      [optionType, optionName]
    );
    if (existing) return res.status(409).json({ error: 'This option already exists' });

    const result = await dbRun(
      `INSERT INTO tblCollectorOption (option_type, option_name) VALUES (?, ?)`,
      [optionType, optionName]
    );
    res.status(201).json({ id: result.lastID, option_type: optionType, option_name: optionName, is_active: 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/options/:optionId', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const current = await dbGet(`SELECT * FROM tblCollectorOption WHERE id = ?`, [req.params.optionId]);
    if (!current) return res.status(404).json({ error: 'Collector option not found' });

    const optionName = normalizeOption(req.body.option_name ?? current.option_name);
    const isActive = req.body.is_active === undefined ? current.is_active : (req.body.is_active ? 1 : 0);
    if (!optionName) return res.status(400).json({ error: 'Option name is required' });
    if (optionName.length > 100) return res.status(400).json({ error: 'Option name must not exceed 100 characters' });

    const duplicate = await dbGet(
      `SELECT id FROM tblCollectorOption WHERE option_type = ? AND option_name = ? COLLATE NOCASE AND id <> ?`,
      [current.option_type, optionName, current.id]
    );
    if (duplicate) return res.status(409).json({ error: 'This option already exists' });

    await dbRun('BEGIN TRANSACTION');
    try {
      await dbRun(
        `UPDATE tblCollectorOption SET option_name = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
        [optionName, isActive, current.id]
      );
      if (optionName !== current.option_name) {
        const collectorColumn = current.option_type === 'assigned_area' ? 'assigned_to' : 'supervisor';
        await dbRun(
          `UPDATE tblCollector SET ${collectorColumn} = ? WHERE ${collectorColumn} = ? COLLATE NOCASE`,
          [optionName, current.option_name]
        );
      }
      await dbRun('COMMIT');
    } catch (err) {
      await dbRun('ROLLBACK').catch(() => {});
      throw err;
    }

    res.json({ id: current.id, option_type: current.option_type, option_name: optionName, is_active: isActive });
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
    const { first_name, last_name, index_card_name, branch_id, assigned_to, supervisor } = req.body;
    const maxCol = await dbGet("SELECT MAX(CAST(REPLACE(collector_code, 'COL-', '') AS INTEGER)) as c FROM tblCollector");
    const collector_code = `COL-${String((maxCol?.c || 0) + 1).padStart(4, '0')}`;
    const result = await dbRun(`INSERT INTO tblCollector (collector_code, first_name, last_name, index_card_name, branch_id, assigned_to, supervisor) VALUES (?,?,?,?,?,?,?)`, [collector_code, first_name, last_name, index_card_name || null, branch_id, assigned_to, supervisor]);
    res.status(201).json({ id: result.lastID, collector_code });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { first_name, last_name, index_card_name, branch_id, assigned_to, supervisor, is_active } = req.body;
    await dbRun(`UPDATE tblCollector SET first_name=?, last_name=?, index_card_name=?, branch_id=?, assigned_to=?, supervisor=?, is_active=? WHERE id=?`, [first_name, last_name, index_card_name || null, branch_id, assigned_to, supervisor, is_active ?? 1, req.params.id]);
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
