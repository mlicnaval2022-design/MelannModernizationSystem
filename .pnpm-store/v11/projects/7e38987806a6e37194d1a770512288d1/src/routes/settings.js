const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/permissions');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const settings = await dbAll('SELECT * FROM tblSystemSettings');
    const holidays = await dbAll('SELECT * FROM tblHoliday ORDER BY holiday_date ASC');
    res.json({ settings, holidays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, requireModuleAccess('crud'), async (req, res) => {
  try {
    const { settings } = req.body;
    // settings is expected to be an object: { 'daily_cutoff': '20:00', ... }
    for (const [key, val] of Object.entries(settings)) {
      await dbRun(`
        UPDATE tblSystemSettings SET setting_value = ?, updated_at = datetime('now') WHERE setting_key = ?
      `, [val.toString(), key]);
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/holiday', authenticateToken, requireModuleAccess('crud'), async (req, res) => {
  try {
    const { holiday_date, description } = req.body;
    await dbRun(`INSERT INTO tblHoliday (holiday_date, description) VALUES (?, ?)`, [holiday_date, description]);
    res.json({ message: 'Holiday added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/holiday/:id', authenticateToken, requireModuleAccess('crud'), async (req, res) => {
  try {
    await dbRun(`DELETE FROM tblHoliday WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Holiday removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
