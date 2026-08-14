const express = require('express');
const dayjs = require('dayjs');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const reconLoanTypes = ['recon', 'reconstruct', 'reconstructed'];
const ratedCollectorLastNames = ['torreta', 'domingono', 'caballes', 'jugar', 'rosal', 'laude'];
const companyPeriods = [
  ['01-01', '02-15'],
  ['02-16', '03-31'],
  ['04-01', '05-15'],
  ['05-16', '06-30'],
  ['07-01', '08-15'],
  ['08-16', '09-30'],
  ['10-01', '11-15'],
  ['11-16', '12-31']
];

const asAmount = value => Number(value || 0);
const ratingFor = accomplishment => {
  if (!Number.isFinite(accomplishment)) return 'Not rated';
  if (accomplishment >= 115) return 'Outstanding Performance';
  if (accomplishment >= 110) return 'Passing / Very Satisfactory';
  if (accomplishment >= 105) return 'Below Passing Standard';
  if (accomplishment >= 95) return 'Unsatisfactory Performance';
  if (accomplishment >= 90) return 'Poor Performance';
  return 'Critical Performance Failure';
};

function getBranchFilter(branchId, column = 'branch_id') {
  return branchId ? { sql: ` AND ${column} = ?`, params: [branchId] } : { sql: '', params: [] };
}

function getPreviousCompanyPeriod(startDate) {
  const start = dayjs(startDate).startOf('day');
  const candidates = [];
  for (const year of [start.year() - 1, start.year()]) {
    companyPeriods.forEach(([from, to]) => candidates.push({
      start_date: `${year}-${from}`,
      end_date: `${year}-${to}`
    }));
  }
  return candidates
    .filter(period => dayjs(period.end_date).isBefore(start, 'day'))
    .sort((a, b) => b.end_date.localeCompare(a.end_date))[0] || null;
}

async function buildPeriodEvaluations(period) {
  const collectorBranch = getBranchFilter(period.branch_id, 'co.branch_id');
  const collectors = await dbAll(`
    SELECT co.id, co.first_name || ' ' || co.last_name AS name
    FROM tblCollector co
    WHERE co.is_active = 1
      AND LOWER(TRIM(co.last_name)) IN (${ratedCollectorLastNames.map(() => '?').join(', ')})${collectorBranch.sql}
    ORDER BY co.last_name, co.first_name
  `, [...ratedCollectorLastNames, ...collectorBranch.params]);
  const expenseBranchSql = period.branch_id
    ? ` AND (t.branch_id = ? OR t.branch_id = '' OR t.branch_id IS NULL)`
    : '';
  const expenseBranchParams = period.branch_id ? [period.branch_id] : [];
  const expenseRow = await dbGet(`
    SELECT COALESCE(SUM(t.amount), 0) AS total
    FROM tblTransaction t
    WHERE date(t.transaction_date) BETWEEN date(?) AND date(?)
      AND t.status = 'active'
      AND LOWER(COALESCE(t.transaction_type, 'expense')) = 'expense'${expenseBranchSql}
  `, [period.start_date, period.end_date, ...expenseBranchParams]);
  const expenseShare = collectors.length ? asAmount(expenseRow?.total) / collectors.length : 0;
  const previousPeriod = getPreviousCompanyPeriod(period.start_date);
  const reportedPastdueByCollector = new Map();
  if (previousPeriod) {
    const pastdueBranch = getBranchFilter(period.branch_id, 'l.branch_id');
    const pastdueRows = await dbAll(`
      SELECT l.collector_id, COALESCE(SUM(l.balance), 0) AS total
      FROM tblLoan l
      WHERE date(l.date_maturity) BETWEEN date(?) AND date(?)
        AND LOWER(COALESCE(l.status, '')) IN ('active', 'pastdue')
        AND COALESCE(l.balance, 0) > 0${pastdueBranch.sql}
      GROUP BY l.collector_id
    `, [previousPeriod.start_date, previousPeriod.end_date, ...pastdueBranch.params]);
    pastdueRows.forEach(row => reportedPastdueByCollector.set(Number(row.collector_id), asAmount(row.total)));
  }

  await dbRun('DELETE FROM tblFortyFiveDayRatingEvaluation WHERE period_id = ?', [period.id]);
  for (const collector of collectors) {
    const collectionRow = await dbGet(`
      SELECT COALESCE(SUM(p.amount_paid), 0) AS total
      FROM tblPayment p
      JOIN tblCustomer c ON c.id = p.customer_id
      WHERE COALESCE(p.collector_id, c.collector_id) = ?
        AND date(p.date_paid) BETWEEN date(?) AND date(?)
        AND p.status IN ('active', 'penalty')
    `, [collector.id, period.start_date, period.end_date]);
    const releaseRow = await dbGet(`
      SELECT COALESCE(SUM(l.principal), 0) AS total
      FROM tblLoan l
      WHERE l.collector_id = ?
        AND date(l.date_released) BETWEEN date(?) AND date(?)
        AND LOWER(COALESCE(l.status, '')) IN ('active', 'fully_paid')
        AND LOWER(COALESCE(l.loan_type, 'regular')) NOT IN (${reconLoanTypes.map(() => '?').join(', ')})
    `, [collector.id, period.start_date, period.end_date, ...reconLoanTypes]);
    const collectionTotal = asAmount(collectionRow?.total);
    const releaseTotal = asAmount(releaseRow?.total);
    const netIncome = collectionTotal - releaseTotal - expenseShare;
    const denominator = releaseTotal + expenseShare;
    const accomplishment = denominator > 0 ? (collectionTotal / denominator) * 100 : null;
    await dbRun(`
      INSERT INTO tblFortyFiveDayRatingEvaluation
        (period_id, collector_id, collection_total, release_total, expense_total, reported_pastdue, net_income, accomplishment_percentage, rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [period.id, collector.id, collectionTotal, releaseTotal, expenseShare, reportedPastdueByCollector.get(Number(collector.id)) || 0, netIncome, accomplishment, ratingFor(accomplishment)]);
  }
}

router.get('/periods', authenticateToken, async (req, res) => {
  try {
    const branch = getBranchFilter(req.user.branch_id, 'p.branch_id');
    const periods = await dbAll(`
      SELECT p.*, COUNT(e.id) AS collector_count,
        ROUND(AVG(e.accomplishment_percentage), 2) AS overall_accomplishment,
        COALESCE(SUM(e.collection_total), 0) AS total_collection,
        COALESCE(SUM(e.release_total), 0) AS total_release,
        COALESCE(SUM(e.expense_total), 0) AS total_expense
      FROM tblFortyFiveDayRatingPeriod p
      LEFT JOIN tblFortyFiveDayRatingEvaluation e ON e.period_id = p.id
      WHERE 1 = 1${branch.sql}
      GROUP BY p.id
      ORDER BY p.start_date DESC
    `, branch.params);
    res.json(periods.map(period => ({ ...period, overall_rating: ratingFor(Number(period.overall_accomplishment)) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/periods', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.body;
    const start = dayjs(start_date);
    const end = dayjs(end_date);
    if (!start.isValid() || !end.isValid() || end.isBefore(start, 'day')) {
      return res.status(400).json({ error: 'Select a valid rating period. The end date cannot be before the start date.' });
    }
    const duplicate = await dbGet('SELECT id FROM tblFortyFiveDayRatingPeriod WHERE branch_id IS ? AND start_date = ? AND end_date = ?', [req.user.branch_id || null, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]);
    if (duplicate) return res.status(409).json({ error: 'This 45-day rating period already exists.' });
    const created = await dbRun('INSERT INTO tblFortyFiveDayRatingPeriod (branch_id, start_date, end_date, created_by) VALUES (?, ?, ?, ?)', [req.user.branch_id || null, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'), req.user.id]);
    const period = { id: created.lastID, branch_id: req.user.branch_id || null, start_date: start.format('YYYY-MM-DD'), end_date: end.format('YYYY-MM-DD') };
    await buildPeriodEvaluations(period);
    res.status(201).json(period);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/periods/:id', authenticateToken, async (req, res) => {
  try {
    const branch = getBranchFilter(req.user.branch_id, 'branch_id');
    const period = await dbGet(`SELECT * FROM tblFortyFiveDayRatingPeriod WHERE id = ?${branch.sql}`, [req.params.id, ...branch.params]);
    if (!period) return res.status(404).json({ error: 'Rating period not found.' });
    if (period.status !== 'Finalized') await buildPeriodEvaluations(period);
    const evaluations = await dbAll(`
      SELECT e.*, co.first_name || ' ' || co.last_name AS collector_name
      FROM tblFortyFiveDayRatingEvaluation e
      JOIN tblCollector co ON co.id = e.collector_id
      WHERE e.period_id = ?
      ORDER BY e.accomplishment_percentage DESC, collector_name
    `, [period.id]);
    res.json({ period: { ...period, reported_pastdue_period: getPreviousCompanyPeriod(period.start_date) }, evaluations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/periods/:id/refresh', authenticateToken, async (req, res) => {
  try {
    const branch = getBranchFilter(req.user.branch_id, 'branch_id');
    const period = await dbGet(`SELECT * FROM tblFortyFiveDayRatingPeriod WHERE id = ?${branch.sql}`, [req.params.id, ...branch.params]);
    if (!period) return res.status(404).json({ error: 'Rating period not found.' });
    if (period.status === 'Finalized') return res.status(409).json({ error: 'Finalized periods cannot be refreshed.' });
    await buildPeriodEvaluations(period);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
