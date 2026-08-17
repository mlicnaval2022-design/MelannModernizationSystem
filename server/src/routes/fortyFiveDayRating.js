const express = require('express');
const dayjs = require('dayjs');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sqlNotSunday } = require('../services/operationDays');

const router = express.Router();
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
const isFinalStatus = status => ['final', 'finalized'].includes(String(status || '').toLowerCase());
const ratingFor = accomplishment => {
  if (!Number.isFinite(accomplishment)) return 'Not rated';
  if (accomplishment >= 115) return 'Outstanding Performance';
  if (accomplishment >= 110) return 'Passing / Very Satisfactory';
  if (accomplishment >= 105) return 'Below Passing Standard';
  if (accomplishment >= 95) return 'Unsatisfactory Performance';
  if (accomplishment >= 90) return 'Poor Performance';
  return 'Critical Performance Failure';
};

function aggregateRating(name, rows, extra = {}) {
  const totals = rows.reduce((sum, row) => ({
    collection_total: sum.collection_total + asAmount(row.collection_total),
    release_total: sum.release_total + asAmount(row.release_total),
    expense_total: sum.expense_total + asAmount(row.expense_total),
    reported_pastdue: sum.reported_pastdue + asAmount(row.reported_pastdue)
  }), { collection_total: 0, release_total: 0, expense_total: 0, reported_pastdue: 0 });
  const denominator = totals.release_total + totals.expense_total;
  const accomplishment = denominator > 0 ? (totals.collection_total / denominator) * 100 : null;
  return {
    name,
    ...extra,
    ...totals,
    net_income: totals.collection_total - totals.release_total - totals.expense_total,
    accomplishment_percentage: accomplishment,
    rating: ratingFor(accomplishment)
  };
}

function getSupervisorEvaluations(evaluations) {
  const groups = new Map();
  evaluations.forEach(row => {
    const supervisor = String(row.supervisor || '').trim() || 'Unassigned Supervisor';
    if (!groups.has(supervisor)) groups.set(supervisor, []);
    groups.get(supervisor).push(row);
  });
  return Array.from(groups.entries()).map(([supervisor, rows]) => aggregateRating(supervisor, rows, {
    collectors: rows.map(row => row.collector_name),
    collector_results: rows
  })).sort((a, b) => b.accomplishment_percentage - a.accomplishment_percentage || a.name.localeCompare(b.name));
}

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

async function getActualCollectionTotal(collectorId, startDate, endDate) {
  const paymentRow = await dbGet(`
    SELECT COALESCE(SUM(p.amount_paid), 0) AS total
    FROM tblPayment p
    LEFT JOIN tblLoan l ON l.id = p.loan_id
    LEFT JOIN tblCustomer c ON c.id = p.customer_id
    WHERE COALESCE(p.collector_id, l.collector_id, c.collector_id) = ?
      AND date(p.date_paid) BETWEEN date(?) AND date(?)
      AND p.status IN ('active', 'penalty')
      AND LOWER(COALESCE(p.payment_type, '')) != 'passbook'
      AND LOWER(COALESCE(p.remarks, '')) NOT LIKE '%passbook%'
      AND ${sqlNotSunday('p.date_paid')}
  `, [collectorId, startDate, endDate]);
  return asAmount(paymentRow?.total);
}

async function computeEvaluations({ branch_id, start_date, end_date }) {
  const start = dayjs(start_date).format('YYYY-MM-DD');
  const end = dayjs(end_date).format('YYYY-MM-DD');
  const collectorBranch = getBranchFilter(branch_id, 'co.branch_id');
  const collectors = await dbAll(`
    SELECT co.id, co.first_name || ' ' || co.last_name AS name,
      co.supervisor, co.branch_id, b.branch_name
    FROM tblCollector co
    LEFT JOIN tblBranch b ON b.id = co.branch_id
    WHERE co.is_active = 1
      AND LOWER(TRIM(co.last_name)) IN (${ratedCollectorLastNames.map(() => '?').join(', ')})${collectorBranch.sql}
    ORDER BY co.last_name, co.first_name
  `, [...ratedCollectorLastNames, ...collectorBranch.params]);
  const expenseBranchSql = branch_id
    ? ` AND (t.branch_id = ? OR t.branch_id = '' OR t.branch_id IS NULL)`
    : '';
  const expenseBranchParams = branch_id ? [branch_id] : [];
  const expenseRow = await dbGet(`
    SELECT COALESCE(SUM(t.amount), 0) AS total
    FROM tblTransaction t
    WHERE date(t.transaction_date) BETWEEN date(?) AND date(?)
      AND t.status = 'active'
      AND LOWER(COALESCE(t.transaction_type, 'expense')) = 'expense'
      AND LOWER(TRIM(COALESCE(t.category, ''))) NOT IN ('short overage', 'short/overage', 'shortage', 'overage')
      AND LOWER(TRIM(COALESCE(t.description, ''))) NOT IN ('short overage', 'short/overage', 'shortage', 'overage')${expenseBranchSql}
  `, [start, end, ...expenseBranchParams]);
  const expenseShare = collectors.length ? asAmount(expenseRow?.total) / collectors.length : 0;
  const previousPeriod = getPreviousCompanyPeriod(start);
  const reportedPastdueByCollector = new Map();
  if (previousPeriod) {
    const pastdueBranch = getBranchFilter(branch_id, 'l.branch_id');
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

  const evaluations = [];
  for (const collector of collectors) {
    const releaseRow = await dbGet(`
      SELECT COALESCE(SUM(l.principal), 0) AS total
      FROM tblLoan l
      WHERE l.collector_id = ?
        AND l.date_released BETWEEN ? AND ?
        AND LOWER(COALESCE(l.status, '')) != 'reversed'
        AND ${sqlNotSunday('l.date_released')}
        AND (
          LOWER(COALESCE(l.loan_type, '')) LIKE '%reloan%'
          OR LOWER(COALESCE(l.loan_type, '')) LIKE '%re-loan%'
          OR LOWER(COALESCE(l.loan_type, '')) NOT LIKE '%recon%'
        )
    `, [collector.id, start, end]);
    const collectionTotal = await getActualCollectionTotal(collector.id, start, end);
    const releaseTotal = asAmount(releaseRow?.total);
    const netIncome = collectionTotal - releaseTotal - expenseShare;
    const denominator = releaseTotal + expenseShare;
    const accomplishment = denominator > 0 ? (collectionTotal / denominator) * 100 : null;
    evaluations.push({
      collector_id: collector.id,
      collector_name: collector.name,
      supervisor: collector.supervisor,
      branch_id: collector.branch_id,
      branch_name: collector.branch_name,
      collection_total: collectionTotal,
      release_total: releaseTotal,
      expense_total: expenseShare,
      reported_pastdue: reportedPastdueByCollector.get(Number(collector.id)) || 0,
      net_income: netIncome,
      accomplishment_percentage: accomplishment,
      rating: ratingFor(accomplishment)
    });
  }

  evaluations.sort((a, b) => (b.accomplishment_percentage || 0) - (a.accomplishment_percentage || 0) || a.collector_name.localeCompare(b.collector_name));
  const supervisor_evaluations = getSupervisorEvaluations(evaluations);
  const branchName = evaluations[0]?.branch_name || (branch_id ? (await dbGet('SELECT branch_name FROM tblBranch WHERE id = ?', [branch_id]))?.branch_name : null) || 'Current Branch';
  const branch_manager_evaluations = [aggregateRating(`${branchName} Branch Manager`, evaluations, {
    branch_id: branch_id || null,
    branch_name: branchName,
    supervisors: supervisor_evaluations.map(row => row.name),
    supervisor_results: supervisor_evaluations
  })];
  const operations_manager_evaluation = aggregateRating('Operations Manager', branch_manager_evaluations, {
    branches: [branchName],
    branch_results: branch_manager_evaluations
  });

  return {
    period: {
      start_date: start,
      end_date: end,
      reported_pastdue_period: previousPeriod
    },
    evaluations,
    supervisor_evaluations,
    branch_manager_evaluations,
    operations_manager_evaluation
  };
}

async function buildPeriodEvaluations(period) {
  const result = await computeEvaluations({
    branch_id: period.branch_id,
    start_date: period.start_date,
    end_date: period.end_date
  });
  await dbRun('DELETE FROM tblFortyFiveDayRatingEvaluation WHERE period_id = ?', [period.id]);
  for (const evaluation of result.evaluations) {
    await dbRun(`
      INSERT INTO tblFortyFiveDayRatingEvaluation
        (period_id, collector_id, collection_total, release_total, expense_total, reported_pastdue, net_income, accomplishment_percentage, rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      period.id,
      evaluation.collector_id,
      evaluation.collection_total,
      evaluation.release_total,
      evaluation.expense_total,
      evaluation.reported_pastdue,
      evaluation.net_income,
      evaluation.accomplishment_percentage,
      evaluation.rating
    ]);
  }
}

router.get('/calculate', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const start = dayjs(start_date);
    const end = dayjs(end_date);
    if (!start.isValid() || !end.isValid() || end.isBefore(start, 'day')) {
      return res.status(400).json({ error: 'Please select a valid start date and end date.' });
    }
    const result = await computeEvaluations({
      branch_id: req.user.branch_id,
      start_date: start.format('YYYY-MM-DD'),
      end_date: end.format('YYYY-MM-DD')
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/periods', authenticateToken, async (req, res) => {
  try {
    const branch = getBranchFilter(req.user.branch_id, 'p.branch_id');
    const periods = await dbAll(`
      SELECT p.*, COUNT(e.id) AS collector_count,
        CASE WHEN COALESCE(SUM(e.release_total + e.expense_total), 0) > 0
          THEN ROUND(COALESCE(SUM(e.collection_total), 0) * 100.0 / SUM(e.release_total + e.expense_total), 2)
          ELSE NULL END AS overall_accomplishment,
        COALESCE(SUM(e.collection_total), 0) AS total_collection,
        COALESCE(SUM(e.release_total), 0) AS total_release,
        COALESCE(SUM(e.expense_total), 0) AS total_expense
      FROM tblFortyFiveDayRatingPeriod p
      LEFT JOIN tblFortyFiveDayRatingEvaluation e ON e.period_id = p.id
      WHERE 1 = 1${branch.sql}
      GROUP BY p.id
      ORDER BY p.start_date DESC
    `, branch.params);
    res.json(periods.map(period => ({ ...period, overall_rating: ratingFor(period.overall_accomplishment == null ? null : Number(period.overall_accomplishment)) })));
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
    if (!isFinalStatus(period.status)) await buildPeriodEvaluations(period);
    const evaluations = await dbAll(`
      SELECT e.*, co.first_name || ' ' || co.last_name AS collector_name,
        co.supervisor, co.branch_id, b.branch_name
      FROM tblFortyFiveDayRatingEvaluation e
      JOIN tblCollector co ON co.id = e.collector_id
      LEFT JOIN tblBranch b ON b.id = co.branch_id
      WHERE e.period_id = ?
      ORDER BY e.accomplishment_percentage DESC, collector_name
    `, [period.id]);
    const supervisor_evaluations = getSupervisorEvaluations(evaluations);
    const branchName = evaluations[0]?.branch_name || (await dbGet('SELECT branch_name FROM tblBranch WHERE id = ?', [period.branch_id]))?.branch_name || 'Current Branch';
    const branch_manager_evaluations = [aggregateRating(`${branchName} Branch Manager`, evaluations, {
      branch_id: period.branch_id,
      branch_name: branchName,
      supervisors: supervisor_evaluations.map(row => row.name),
      supervisor_results: supervisor_evaluations
    })];

    const operationRows = await dbAll(`
      SELECT p.id AS source_period_id, p.branch_id, p.status, b.branch_name,
        e.id, e.collector_id, e.collection_total, e.release_total, e.expense_total,
        e.reported_pastdue, e.net_income, e.accomplishment_percentage, e.rating,
        co.first_name || ' ' || co.last_name AS collector_name, co.supervisor
      FROM tblFortyFiveDayRatingPeriod p
      JOIN tblFortyFiveDayRatingEvaluation e ON e.period_id = p.id
      JOIN tblCollector co ON co.id = e.collector_id
      LEFT JOIN tblBranch b ON b.id = p.branch_id
      WHERE p.start_date = ? AND p.end_date = ?
        AND (LOWER(p.status) IN ('final', 'finalized') OR p.id = ?)
        AND (
          p.id = ?
          OR LOWER(COALESCE(b.branch_name, '')) LIKE '%ormoc%'
          OR LOWER(COALESCE(b.branch_name, '')) LIKE '%naval%'
          OR LOWER(COALESCE(b.branch_code, '')) LIKE '%ormoc%'
          OR LOWER(COALESCE(b.branch_code, '')) LIKE '%naval%'
        )
      ORDER BY b.branch_name, p.id
    `, [period.start_date, period.end_date, period.id, period.id]);
    const operationGroups = new Map();
    operationRows.forEach(row => {
      const key = Number(row.source_period_id);
      if (!operationGroups.has(key)) operationGroups.set(key, []);
      operationGroups.get(key).push(row);
    });
    const branchResults = Array.from(operationGroups.values()).map(rows => {
      const supervisorResults = getSupervisorEvaluations(rows);
      return aggregateRating(`${rows[0].branch_name || 'Current Branch'} Branch Manager`, rows, {
        branch_id: rows[0].branch_id,
        branch_name: rows[0].branch_name || 'Current Branch',
        status: rows[0].status,
        supervisors: supervisorResults.map(row => row.name),
        supervisor_results: supervisorResults
      });
    });
    const operations_manager_evaluation = aggregateRating('Operations Manager', branchResults, {
      branches: branchResults.map(row => row.branch_name),
      branch_results: branchResults
    });
    res.json({
      period: { ...period, reported_pastdue_period: getPreviousCompanyPeriod(period.start_date) },
      evaluations,
      supervisor_evaluations,
      branch_manager_evaluations,
      operations_manager_evaluation
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/periods/:id/refresh', authenticateToken, async (req, res) => {
  try {
    const branch = getBranchFilter(req.user.branch_id, 'branch_id');
    const period = await dbGet(`SELECT * FROM tblFortyFiveDayRatingPeriod WHERE id = ?${branch.sql}`, [req.params.id, ...branch.params]);
    if (!period) return res.status(404).json({ error: 'Rating period not found.' });
    if (isFinalStatus(period.status)) return res.status(409).json({ error: 'Final periods cannot be refreshed.' });
    await buildPeriodEvaluations(period);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/periods/:id/lock', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const branch = getBranchFilter(req.user.branch_id, 'branch_id');
    const period = await dbGet(`SELECT * FROM tblFortyFiveDayRatingPeriod WHERE id = ?${branch.sql}`, [req.params.id, ...branch.params]);
    if (!period) return res.status(404).json({ error: 'Rating period not found.' });
    if (isFinalStatus(period.status)) return res.status(409).json({ error: 'Rating period is already final.' });
    await buildPeriodEvaluations(period);
    await dbRun(`UPDATE tblFortyFiveDayRatingPeriod
      SET status = 'Final', finalized_by = ?, finalized_at = datetime('now'), reopened_by = NULL, reopened_at = NULL, reopen_reason = NULL
      WHERE id = ?`, [req.user.id, period.id]);
    await dbRun(`INSERT INTO tblFortyFiveDayRatingAudit (period_id, action, old_status, new_status, changed_by)
      VALUES (?, 'Lock', ?, 'Final', ?)`, [period.id, period.status, req.user.id]);
    res.json({ success: true, status: 'Final' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/periods/:id/unlock', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'An unlock reason is required.' });
    const branch = getBranchFilter(req.user.branch_id, 'branch_id');
    const period = await dbGet(`SELECT * FROM tblFortyFiveDayRatingPeriod WHERE id = ?${branch.sql}`, [req.params.id, ...branch.params]);
    if (!period) return res.status(404).json({ error: 'Rating period not found.' });
    await dbRun(`UPDATE tblFortyFiveDayRatingPeriod
      SET status = 'Draft', reopened_by = ?, reopened_at = datetime('now'), reopen_reason = ?
      WHERE id = ?`, [req.user.id, reason, period.id]);
    await dbRun(`INSERT INTO tblFortyFiveDayRatingAudit (period_id, action, old_status, new_status, reason, changed_by)
      VALUES (?, 'Unlock', ?, 'Draft', ?, ?)`, [period.id, period.status, reason, req.user.id]);
    res.json({ success: true, status: 'Draft' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/periods/:id', authenticateToken, async (req, res) => {
  try {
    const branch = getBranchFilter(req.user.branch_id, 'branch_id');
    const period = await dbGet(`SELECT * FROM tblFortyFiveDayRatingPeriod WHERE id = ?${branch.sql}`, [req.params.id, ...branch.params]);
    if (!period) return res.status(404).json({ error: 'Rating period not found.' });
    if (isFinalStatus(period.status) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can delete a final/locked rating period.' });
    }
    await dbRun('DELETE FROM tblFortyFiveDayRatingAudit WHERE period_id = ?', [period.id]);
    await dbRun('DELETE FROM tblFortyFiveDayRatingEvaluation WHERE period_id = ?', [period.id]);
    await dbRun('DELETE FROM tblFortyFiveDayRatingPeriod WHERE id = ?', [period.id]);
    res.json({ success: true, message: 'Rating period deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
