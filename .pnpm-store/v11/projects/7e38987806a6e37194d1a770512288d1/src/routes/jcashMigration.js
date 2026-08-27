const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { scanJcash, migrateSelectedJcash } = require('../services/jcashMigrationService');

const router = express.Router();

const sendRouteError = (res, err) => res.status(err.statusCode || 500).json({ error: err.message });

router.post('/scan', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { from, to, loan_id, password } = req.body;
    res.json(await scanJcash({ from, to, loanId: loan_id, password }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/migrate', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { from, to, loan_id, loan_codes, password } = req.body;
    res.json(await migrateSelectedJcash({ from, to, loanId: loan_id, loanCodes: loan_codes, user: req.user, password }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

module.exports = router;
