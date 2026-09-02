const express = require('express');
const { dbAll, dbGet, dbRun, withTransaction } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { authorizeReportType } = require('../middleware/reportPermissions');
const { runPastDueUpdate } = require('../services/pastDueUpdater');
const { requireOperationDate, sqlNotSunday, isSundayDate } = require('../services/operationDays');
const { synchronizePromiseToPayStatuses } = require('../services/promiseToPayStatus');
const { buildCollectionPaymentExclusionSql } = require('../services/paymentClassification');
const router = express.Router();
router.use(authorizeReportType);
const sendRouteError = (res, err) => res.status(err.statusCode || 500).json({ error: err.message });

const toLocalDateString = (date = new Date()) => {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().split('T')[0];
};

const toDateKey = value => String(value || '').slice(0, 10);

const parseDateKey = value => {
  const dateKey = toDateKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const shiftDateKey = (dateKey, days) => {
  const date = parseDateKey(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
};

const buildCollectionTrendPeriods = (mode, endDateKey) => {
  if (mode === 'daily') {
    const periods = [];
    let cursor = endDateKey;
    while (periods.length < 7) {
      if (!isSundayDate(cursor)) periods.unshift({ date: cursor, start_date: cursor, end_date: cursor });
      cursor = shiftDateKey(cursor, -1);
    }
    return periods;
  }

  const periodDays = mode === 'weekly' ? 7 : 45;
  const periodCount = mode === 'weekly' ? 8 : 6;
  return Array.from({ length: periodCount }, (_, index) => {
    const periodsBack = periodCount - index - 1;
    const end_date = shiftDateKey(endDateKey, -(periodsBack * periodDays));
    return {
      date: end_date,
      start_date: shiftDateKey(end_date, -(periodDays - 1)),
      end_date,
    };
  });
};

const getCollectionTrend = async ({ mode = 'daily', endDate = toLocalDateString() } = {}) => {
  const normalizedMode = mode === '45-days' ? mode : String(mode || '').toLowerCase();
  if (!['daily', 'weekly', '45-days'].includes(normalizedMode)) {
    const error = new Error('Trend mode must be daily, weekly, or 45-days');
    error.statusCode = 400;
    throw error;
  }
  if (!parseDateKey(endDate)) {
    const error = new Error('A valid end_date in YYYY-MM-DD format is required');
    error.statusCode = 400;
    throw error;
  }

  const today = toLocalDateString();
  let effectiveEndDate = endDate;
  let currentDayExcluded = false;

  // A workday in progress should not be treated as a completed zero-collection
  // period. Until a payment is posted today, use the prior operating day for
  // the trend so its low point and comparison are based on finished days.
  if (endDate === today) {
    const todayCollections = await dbGet(`
      SELECT COUNT(*) as count
      FROM tblPayment
      WHERE date_paid = ?
        AND status IN ('active', 'penalty')
        AND ${buildCollectionPaymentExclusionSql()}
        AND ${sqlNotSunday('date_paid')}
    `, [today]);

    if (!Number(todayCollections?.count || 0)) {
      effectiveEndDate = getPreviousOperationDate(today);
      currentDayExcluded = true;
    }
  }

  const periods = buildCollectionTrendPeriods(normalizedMode, effectiveEndDate);
  const dateFrom = periods[0].start_date;
  const dateTo = periods[periods.length - 1].end_date;
  const payments = await dbAll(`
    SELECT date_paid as date, SUM(amount_paid) as total
    FROM tblPayment
    WHERE date_paid BETWEEN ? AND ?
      AND status IN ('active', 'penalty')
      AND ${buildCollectionPaymentExclusionSql()}
      AND ${sqlNotSunday('date_paid')}
    GROUP BY date_paid
    ORDER BY date_paid
  `, [dateFrom, dateTo]);

  const rows = periods.map(period => ({
    ...period,
    total: payments.reduce((sum, payment) => (
      payment.date >= period.start_date && payment.date <= period.end_date
        ? sum + Number(payment.total || 0)
        : sum
    ), 0),
  }));

  return {
    mode: normalizedMode,
    requested_end_date: endDate,
    end_date: effectiveEndDate,
    date_from: dateFrom,
    date_to: dateTo,
    current_day_excluded: currentDayExcluded,
    current_day_in_progress: endDate === today && !currentDayExcluded,
    rows,
  };
};

const normalizeCollectorReportName = value => {
  const name = String(value || '').trim();
  if (!name) return 'Unassigned';
  return name.replace(/\s+past\s*due$/i, '').trim() || 'Unassigned';
};

const buildMonitoringEligibilityCondition = () => `
  LOWER(c.status) IN ('active', 'recon')
  AND LOWER(c.status) NOT LIKE '%pastdue%'
  AND LOWER(c.status) NOT LIKE '%past due%'
  AND LOWER(l.status) = 'active'
  AND LOWER(l.status) NOT LIKE '%pastdue%'
  AND LOWER(l.status) NOT LIKE '%past due%'
  AND COALESCE(l.balance, 0) > 0
  AND (
    l.date_maturity IS NULL
    OR date(l.date_maturity) >= date(?)
  )
`;



const buildClientAddress = (loan) => [
  loan.customer_address_line || loan.address,
  loan.customer_sitio,
  loan.customer_purok,
  loan.customer_brgy,
  loan.customer_city,
  loan.customer_province,
  loan.customer_zip_code
].map(part => String(part || '').trim()).filter(Boolean).join(', ');

const normalizeLoanTypeKey = type => String(type || '').toUpperCase().replace(/[-\s]/g, '');

const resolvePrintablePreviousBalance = async (loan, findPriorBalancePayment = ({ customerId, dateReleased }) => dbGet(`
  SELECT amount_paid
  FROM tblPayment
  WHERE customer_id = ?
    AND date_paid = ?
    AND status = 'active'
    AND LOWER(COALESCE(remarks, '')) LIKE '%old balance during%'
  ORDER BY id DESC
  LIMIT 1
`, [customerId, dateReleased])) => {
  const normalizedLoanType = normalizeLoanTypeKey(loan.loan_type);
  if (!['RECON', 'RELOAN'].includes(normalizedLoanType) || Number(loan.previous_balance || 0) > 0) {
    return loan.previous_balance;
  }

  const priorBalancePayment = await findPriorBalancePayment({
    customerId: loan.customer_id,
    dateReleased: loan.date_released,
  });

  if (priorBalancePayment) loan.previous_balance = Number(priorBalancePayment.amount_paid || 0);
  return loan.previous_balance;
};

const buildCollectionReleaseChargeRows = releases => releases.flatMap(loan => {
  const base = {
    loan_id: loan.id,
    ...(loan.collector_id != null ? { collector_id: loan.collector_id } : {}),
    loan_code: loan.loan_code,
    customer_id: loan.customer_id,
    customer_code: loan.customer_code,
    customer_name: loan.customer_name,
    collector_name: loan.collector_name || 'Unassigned',
    date_paid: loan.date_released,
    balance_after: loan.balance,
    collection_source: 'loan_release',
  };
  const rows = [];
  const pushCharge = (kind, amount) => {
    const value = Number(amount || 0);
    if (value <= 0) return;
    rows.push({
      ...base,
      id: `release-charge-${kind}-${loan.id}`,
      amount_paid: value,
      payment_type: kind,
      payment_code: kind.toUpperCase(),
      or_number: kind.toUpperCase(),
      remarks: `Loan release ${kind} charge`,
    });
  };

  if (Number(loan.balance_payment_count || 0) === 0) {
    pushCharge('old_balance', loan.previous_balance);
  }
  if (Number(loan.penalty_payment_count || 0) === 0) {
    pushCharge('penalty', loan.penalty);
  }
  // Passbook charges excluded from collection report per business rule

  return rows;
});

const getCollectionReleaseCharges = async (from, to) => {
  const releases = await dbAll(`
    WITH penalty_payments AS (
      SELECT loan_id, COUNT(*) as payment_count
      FROM tblPayment
      WHERE status = 'penalty'
      GROUP BY loan_id
    ),
    balance_payments AS (
      SELECT customer_id, date_paid, COUNT(*) as payment_count
      FROM tblPayment
      WHERE status = 'active'
        AND ${buildCollectionPaymentExclusionSql()}
        AND (
          LOWER(COALESCE(remarks, '')) LIKE '%old balance%'
          OR LOWER(COALESCE(payment_type, '')) IN ('balance', 'old_balance')
        )
      GROUP BY customer_id, date_paid
    )
    SELECT
      l.id,
      COALESCE(c.collector_id, l.collector_id) as collector_id,
      l.customer_id,
      l.loan_code,
      l.date_released,
      l.balance,
      l.previous_balance,
      l.penalty,
      l.passbook,
      c.customer_code,
      c.full_name as customer_name,
      COALESCE(
        NULLIF(TRIM(cco.first_name || ' ' || cco.last_name), ''),
        NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
        'Unassigned'
      ) as collector_name,
      COALESCE(pp.payment_count, 0) as penalty_payment_count,
      COALESCE(bp.payment_count, 0) as balance_payment_count
    FROM tblLoan l
    LEFT JOIN tblCustomer c ON l.customer_id = c.id
    LEFT JOIN tblCollector co ON l.collector_id = co.id
    LEFT JOIN tblCollector cco ON c.collector_id = cco.id
    LEFT JOIN penalty_payments pp ON pp.loan_id = l.id
    LEFT JOIN balance_payments bp
      ON bp.customer_id = l.customer_id
     AND bp.date_paid = l.date_released
    WHERE l.date_released BETWEEN ? AND ?
      AND LOWER(COALESCE(l.status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled')
      AND ${sqlNotSunday('l.date_released')}
    ORDER BY l.date_released, collector_name, c.full_name
  `, [from, to]);

  return buildCollectionReleaseChargeRows(releases);
};

const ensureCollectionFieldReleaseTables = async () => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tblCollectionFieldRelease (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collector_id INTEGER NOT NULL,
      report_date TEXT NOT NULL,
      amount REAL DEFAULT 0,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(collector_id, report_date)
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tblCollectionFieldReleaseCollector (
      collector_id INTEGER PRIMARY KEY,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (collector_id) REFERENCES tblCollector(id)
    )
  `);
};

const ensureCollectionAdvanceManualTable = () => dbRun(`
  CREATE TABLE IF NOT EXISTS tblCollectionAdvanceManual (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    loan_id INTEGER NOT NULL,
    collector_id INTEGER NOT NULL,
    report_date TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    created_by INTEGER,
    updated_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(loan_id, report_date)
  )
`);

const ensureExpensesReportTables = async () => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tblExpensePersonnel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_name TEXT NOT NULL,
      position TEXT,
      status TEXT DEFAULT 'active',
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tblExpenseCategory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      status TEXT DEFAULT 'active',
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tblEmployeeExpense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personnel_id INTEGER NOT NULL,
      expense_date TEXT NOT NULL,
      category TEXT,
      description TEXT,
      amount REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      status TEXT DEFAULT 'active',
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (personnel_id) REFERENCES tblExpensePersonnel(id)
    )
  `);
  await dbRun(`
    INSERT OR IGNORE INTO tblExpenseCategory (category_name, status)
    SELECT DISTINCT TRIM(category), 'active'
    FROM tblEmployeeExpense
    WHERE TRIM(COALESCE(category, '')) != ''
  `);
};

const normalizeExpenseStatus = value => String(value || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';

const getNameAnchors = value => {
  const tokens = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(token));
  return tokens.length > 1 ? [tokens[0], tokens[tokens.length - 1]] : tokens;
};

const collectorNameMatchesPersonnel = (collectorName, personnelName) => {
  const personnelAnchors = getNameAnchors(personnelName);
  if (!personnelAnchors.length) return false;
  const collectorTokens = new Set(String(collectorName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean));
  return personnelAnchors.every(anchor => collectorTokens.has(anchor));
};

const getPreviousOperationDate = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`);

  do {
    date.setDate(date.getDate() - 1);
  } while (isSundayDate(toLocalDateString(date)));

  return toLocalDateString(date);
};

router.get('/collection-sheet/field-releases', authenticateToken, async (req, res) => {
  try {
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];
    requireOperationDate(targetDate, 'Field release date');
    await ensureCollectionFieldReleaseTables();

    const rows = await dbAll(`
      SELECT co.id as collector_id,
             co.collector_code,
             co.first_name,
             co.last_name,
             COALESCE(fr.amount, 0) as amount
      FROM tblCollector co
      LEFT JOIN tblCollectionFieldRelease fr
        ON fr.collector_id = co.id
       AND fr.report_date = ?
      INNER JOIN tblCollectionFieldReleaseCollector frc
        ON frc.collector_id = co.id
      WHERE co.is_active = 1
      ORDER BY co.last_name COLLATE NOCASE, co.first_name COLLATE NOCASE, co.collector_code COLLATE NOCASE
    `, [targetDate]);

    res.json({ date: targetDate, releases: rows });
  } catch (err) { sendRouteError(res, err); }
});

router.get('/collection-sheet/field-releases/collectors', authenticateToken, async (req, res) => {
  try {
    await ensureCollectionFieldReleaseTables();
    const collectors = await dbAll(`
      SELECT co.id as collector_id,
             co.collector_code,
             co.first_name,
             co.last_name,
             CASE WHEN frc.collector_id IS NULL THEN 0 ELSE 1 END as selected
      FROM tblCollector co
      LEFT JOIN tblCollectionFieldReleaseCollector frc ON frc.collector_id = co.id
      WHERE co.is_active = 1
      ORDER BY co.last_name COLLATE NOCASE, co.first_name COLLATE NOCASE, co.collector_code COLLATE NOCASE
    `);
    res.json({ collectors });
  } catch (err) { sendRouteError(res, err); }
});

router.put('/collection-sheet/field-releases/collectors', authenticateToken, async (req, res) => {
  try {
    await ensureCollectionFieldReleaseTables();
    const rawCollectorIds = Array.isArray(req.body.collector_ids) ? req.body.collector_ids : [];
    if (rawCollectorIds.some(id => !Number.isInteger(Number(id)) || Number(id) <= 0)) {
      return res.status(400).json({ error: 'Collector selection contains an invalid collector.' });
    }
    const collectorIds = [...new Set(rawCollectorIds.map(Number))];

    if (collectorIds.length) {
      const placeholders = collectorIds.map(() => '?').join(', ');
      const activeCollectors = await dbAll(`
        SELECT id FROM tblCollector
        WHERE is_active = 1 AND id IN (${placeholders})
      `, collectorIds);
      if (activeCollectors.length !== collectorIds.length) {
        return res.status(400).json({ error: 'Only active collectors can be selected for Field Release.' });
      }
    }

    await withTransaction(async () => {
      await dbRun('DELETE FROM tblCollectionFieldReleaseCollector');
      for (const collectorId of collectorIds) {
        await dbRun(`
          INSERT INTO tblCollectionFieldReleaseCollector (collector_id, created_by)
          VALUES (?, ?)
        `, [collectorId, req.user.id]);
      }
    });

    res.json({ message: 'Field Release collector selection saved', collector_ids: collectorIds });
  } catch (err) { sendRouteError(res, err); }
});

router.post('/collection-sheet/field-releases', authenticateToken, async (req, res) => {
  try {
    const targetDate = req.body.date || new Date().toISOString().split('T')[0];
    const releases = Array.isArray(req.body.releases) ? req.body.releases : [];
    requireOperationDate(targetDate, 'Field release date');
    await ensureCollectionFieldReleaseTables();

    const selectedCollectorRows = await dbAll(`SELECT collector_id FROM tblCollectionFieldReleaseCollector`);
    const selectedCollectorIds = new Set(selectedCollectorRows.map(row => Number(row.collector_id)));
    const invalidRelease = releases.find(release => !selectedCollectorIds.has(Number(release.collector_id)));
    if (invalidRelease) {
      return res.status(400).json({ error: 'Field Release amounts can only be saved for selected collectors.' });
    }

    await withTransaction(async () => {
      for (const release of releases) {
        const collectorId = Number(release.collector_id);
        const amount = Number(release.amount || 0);
        if (!collectorId || amount < 0) continue;

        await dbRun(`
          INSERT INTO tblCollectionFieldRelease (collector_id, report_date, amount, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(collector_id, report_date)
          DO UPDATE SET amount = excluded.amount, updated_by = excluded.updated_by, updated_at = datetime('now')
        `, [collectorId, targetDate, amount, req.user.id, req.user.id]);
      }
    });

    res.json({ message: 'Field release amounts saved', date: targetDate });
  } catch (err) { sendRouteError(res, err); }
});

router.get('/expenses/personnel', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const rows = await dbAll(`
      SELECT id, employee_name, position, status, created_at, updated_at
      FROM tblExpensePersonnel
      ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, employee_name COLLATE NOCASE
    `);
    res.json(rows);
  } catch (err) { sendRouteError(res, err); }
});

router.post('/expenses/personnel', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const employeeName = String(req.body.employee_name || '').trim();
    if (!employeeName) return res.status(400).json({ error: 'Employee name is required' });

    const result = await dbRun(`
      INSERT INTO tblExpensePersonnel (employee_name, position, status, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?)
    `, [employeeName, req.body.position || null, normalizeExpenseStatus(req.body.status), req.user.id, req.user.id]);

    const row = await dbGet(`SELECT * FROM tblExpensePersonnel WHERE id = ?`, [result.lastID]);
    res.status(201).json(row);
  } catch (err) { sendRouteError(res, err); }
});

router.put('/expenses/personnel/:id', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const employeeName = String(req.body.employee_name || '').trim();
    if (!employeeName) return res.status(400).json({ error: 'Employee name is required' });

    const result = await dbRun(`
      UPDATE tblExpensePersonnel
      SET employee_name = ?, position = ?, status = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [employeeName, req.body.position || null, normalizeExpenseStatus(req.body.status), req.user.id, req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Personnel not found' });

    const row = await dbGet(`SELECT * FROM tblExpensePersonnel WHERE id = ?`, [req.params.id]);
    res.json(row);
  } catch (err) { sendRouteError(res, err); }
});

router.get('/expenses/categories', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const rows = await dbAll(`
      SELECT id, category_name, status, created_at, updated_at
      FROM tblExpenseCategory
      ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, category_name COLLATE NOCASE
    `);
    res.json(rows);
  } catch (err) { sendRouteError(res, err); }
});

router.post('/expenses/categories', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const categoryName = String(req.body.category_name || '').trim();
    if (!categoryName) return res.status(400).json({ error: 'Category name is required' });

    const existing = await dbGet(`SELECT id FROM tblExpenseCategory WHERE category_name = ? COLLATE NOCASE`, [categoryName]);
    if (existing) return res.status(409).json({ error: 'Category already exists' });

    const result = await dbRun(`
      INSERT INTO tblExpenseCategory (category_name, status, created_by, updated_by)
      VALUES (?, ?, ?, ?)
    `, [categoryName, normalizeExpenseStatus(req.body.status), req.user.id, req.user.id]);

    const row = await dbGet(`SELECT * FROM tblExpenseCategory WHERE id = ?`, [result.lastID]);
    res.status(201).json(row);
  } catch (err) { sendRouteError(res, err); }
});

router.put('/expenses/categories/:id', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const categoryName = String(req.body.category_name || '').trim();
    if (!categoryName) return res.status(400).json({ error: 'Category name is required' });

    const current = await dbGet(`SELECT * FROM tblExpenseCategory WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Category not found' });

    const duplicate = await dbGet(`
      SELECT id FROM tblExpenseCategory
      WHERE category_name = ? COLLATE NOCASE AND id != ?
    `, [categoryName, req.params.id]);
    if (duplicate) return res.status(409).json({ error: 'Category already exists' });

    await withTransaction(async () => {
      await dbRun(`
        UPDATE tblExpenseCategory
        SET category_name = ?, status = ?, updated_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [categoryName, normalizeExpenseStatus(req.body.status), req.user.id, req.params.id]);
      if (current.category_name !== categoryName) {
        await dbRun(`
          UPDATE tblEmployeeExpense
          SET category = ?, updated_by = ?, updated_at = datetime('now')
          WHERE category = ? COLLATE NOCASE
        `, [categoryName, req.user.id, current.category_name]);
      }
    });

    const row = await dbGet(`SELECT * FROM tblExpenseCategory WHERE id = ?`, [req.params.id]);
    res.json(row);
  } catch (err) { sendRouteError(res, err); }
});

router.get('/expenses/entries', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const dateFrom = req.query.date_from || '';
    const dateTo = req.query.date_to || '';
    const params = [];
    const filters = [`ee.status = 'active'`];
    if (dateFrom) { filters.push(`date(ee.expense_date) >= date(?)`); params.push(dateFrom); }
    if (dateTo) { filters.push(`date(ee.expense_date) <= date(?)`); params.push(dateTo); }
    if (req.query.personnel_id) { filters.push(`ee.personnel_id = ?`); params.push(req.query.personnel_id); }

    const entries = await dbAll(`
      SELECT ee.*, ep.employee_name, ep.position
      FROM tblEmployeeExpense ee
      JOIN tblExpensePersonnel ep ON ep.id = ee.personnel_id
      WHERE ${filters.join(' AND ')}
      ORDER BY date(ee.expense_date) DESC, ep.employee_name COLLATE NOCASE, ee.id DESC
    `, params);
    res.json(entries);
  } catch (err) { sendRouteError(res, err); }
});

router.post('/expenses/entries', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const personnelId = Number(req.body.personnel_id);
    const expenseDate = req.body.expense_date || toLocalDateString();
    const amount = Number(req.body.amount || 0);
    const category = String(req.body.category || '').trim();
    if (!personnelId) return res.status(400).json({ error: 'Employee is required' });
    if (!expenseDate) return res.status(400).json({ error: 'Expense date is required' });
    if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than zero' });

    const personnel = await dbGet(`SELECT id FROM tblExpensePersonnel WHERE id = ?`, [personnelId]);
    if (!personnel) return res.status(404).json({ error: 'Employee not found' });
    if (category) {
      const configuredCategory = await dbGet(`
        SELECT id FROM tblExpenseCategory WHERE category_name = ? COLLATE NOCASE AND status = 'active'
      `, [category]);
      if (!configuredCategory) return res.status(400).json({ error: 'Please select an active expense category' });
    }

    const result = await dbRun(`
      INSERT INTO tblEmployeeExpense (personnel_id, expense_date, category, description, amount, remarks, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [personnelId, expenseDate, category || null, req.body.description || null, amount, req.body.remarks || null, req.user.id, req.user.id]);

    const row = await dbGet(`
      SELECT ee.*, ep.employee_name, ep.position
      FROM tblEmployeeExpense ee
      JOIN tblExpensePersonnel ep ON ep.id = ee.personnel_id
      WHERE ee.id = ?
    `, [result.lastID]);
    res.status(201).json(row);
  } catch (err) { sendRouteError(res, err); }
});

router.put('/expenses/entries/:id', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const personnelId = Number(req.body.personnel_id);
    const expenseDate = req.body.expense_date || toLocalDateString();
    const amount = Number(req.body.amount || 0);
    const category = String(req.body.category || '').trim();
    if (!personnelId) return res.status(400).json({ error: 'Employee is required' });
    if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than zero' });
    if (category) {
      const configuredCategory = await dbGet(`
        SELECT id FROM tblExpenseCategory WHERE category_name = ? COLLATE NOCASE AND status = 'active'
      `, [category]);
      if (!configuredCategory) return res.status(400).json({ error: 'Please select an active expense category' });
    }

    const result = await dbRun(`
      UPDATE tblEmployeeExpense
      SET personnel_id = ?, expense_date = ?, category = ?, description = ?, amount = ?, remarks = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'active'
    `, [personnelId, expenseDate, category || null, req.body.description || null, amount, req.body.remarks || null, req.user.id, req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Expense entry not found' });

    const row = await dbGet(`
      SELECT ee.*, ep.employee_name, ep.position
      FROM tblEmployeeExpense ee
      JOIN tblExpensePersonnel ep ON ep.id = ee.personnel_id
      WHERE ee.id = ?
    `, [req.params.id]);
    res.json(row);
  } catch (err) { sendRouteError(res, err); }
});

router.delete('/expenses/entries/:id', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const result = await dbRun(`
      UPDATE tblEmployeeExpense
      SET status = 'deleted', updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'active'
    `, [req.user.id, req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Expense entry not found' });
    res.json({ message: 'Expense entry deleted' });
  } catch (err) { sendRouteError(res, err); }
});

router.get('/expenses/collector-matrix', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    let dateFrom = req.query.date_from || '';
    let dateTo = req.query.date_to || '';

    if (!dateTo) {
      dateTo = toLocalDateString();
    }
    if (!dateFrom) {
      const [year, month] = dateTo.split('-');
      dateFrom = `${year}-${month}-01`;
    }

    const rangeStart = dateFrom;
    const rangeEnd = dateTo;

    const dates = [];
    const cur = new Date(`${dateFrom}T00:00:00Z`);
    const end = new Date(`${dateTo}T00:00:00Z`);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    const [personnelList, categoryList, systemCollectors, paymentRows, loanRows, releaseCharges, expenseRows] = await Promise.all([
      dbAll(`
        SELECT id, employee_name, position, status
        FROM tblExpensePersonnel
        WHERE status = 'active'
        ORDER BY CASE WHEN LOWER(TRIM(COALESCE(position, ''))) = 'collector' THEN 0 ELSE 1 END, employee_name COLLATE NOCASE
      `),
      dbAll(`
        SELECT id, category_name, status
        FROM tblExpenseCategory
        WHERE status = 'active'
        ORDER BY id ASC
      `),
      dbAll(`
        SELECT id as collector_id,
               collector_code,
               TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) as collector_name
        FROM tblCollector
      `),
      dbAll(`
        SELECT COALESCE(c.collector_id, l.collector_id, p.collector_id) as collector_id,
               date(p.date_paid) as payment_date,
               COALESCE(SUM(p.amount_paid), 0) as total_amount
        FROM tblPayment p
        LEFT JOIN tblLoan l ON l.id = p.loan_id
        LEFT JOIN tblCustomer c ON c.id = p.customer_id
        WHERE date(p.date_paid) BETWEEN date(?) AND date(?)
          AND p.status IN ('active', 'penalty')
          AND ${buildCollectionPaymentExclusionSql('p')}
          AND ${sqlNotSunday('p.date_paid')}
        GROUP BY COALESCE(c.collector_id, l.collector_id, p.collector_id), date(p.date_paid)
      `, [rangeStart, rangeEnd]),
      dbAll(`
        SELECT COALESCE(c.collector_id, l.collector_id) as collector_id,
               date(l.date_released) as release_date,
               COALESCE(SUM(l.principal), 0) as total_amount
        FROM tblLoan l
        LEFT JOIN tblCustomer c ON c.id = l.customer_id
        WHERE date(l.date_released) BETWEEN date(?) AND date(?)
          AND LOWER(COALESCE(l.status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled')
          AND LOWER(COALESCE(l.loan_type, '')) NOT LIKE '%recon%'
          AND ${sqlNotSunday('l.date_released')}
        GROUP BY COALESCE(c.collector_id, l.collector_id), date(l.date_released)
      `, [rangeStart, rangeEnd]),
      getCollectionReleaseCharges(rangeStart, rangeEnd),
      dbAll(`
        SELECT id, personnel_id, date(expense_date) as expense_date, category, amount, description, remarks
        FROM tblEmployeeExpense
        WHERE status = 'active'
          AND date(expense_date) BETWEEN date(?) AND date(?)
      `, [rangeStart, rangeEnd])
    ]);

    const dailyCollectionMap = new Map();
    paymentRows.forEach(row => {
      const key = `${Number(row.collector_id)}_${row.payment_date}`;
      dailyCollectionMap.set(key, (dailyCollectionMap.get(key) || 0) + Number(row.total_amount || 0));
    });
    releaseCharges.forEach(row => {
      const collectorId = Number(row.collector_id);
      if (!collectorId) return;
      const chargeDate = row.date_paid || row.date_released;
      if (!chargeDate) return;
      const key = `${collectorId}_${chargeDate}`;
      dailyCollectionMap.set(key, (dailyCollectionMap.get(key) || 0) + Number(row.amount_paid || 0));
    });

    const dailyReleaseMap = new Map();
    loanRows.forEach(row => {
      const key = `${Number(row.collector_id)}_${row.release_date}`;
      dailyReleaseMap.set(key, (dailyReleaseMap.get(key) || 0) + Number(row.total_amount || 0));
    });

    const dailyExpenseMap = new Map();
    expenseRows.forEach(row => {
      const key = `${Number(row.personnel_id)}_${row.expense_date}_${String(row.category || '').trim().toLowerCase()}`;
      dailyExpenseMap.set(key, row);
    });

    const categories = categoryList.map(c => c.category_name);

    const sheets = personnelList.map(person => {
      const matchingCollectors = systemCollectors.filter(c =>
        collectorNameMatchesPersonnel(c.collector_name, person.employee_name)
      );
      const collectorIds = matchingCollectors.map(c => Number(c.collector_id));

      const days = {};
      const totals = {
        collection: 0,
        release: 0,
        categories: {},
        total_expense: 0,
        net: 0,
      };
      categories.forEach(cat => { totals.categories[cat] = 0; });

      dates.forEach(d => {
        let col = 0;
        let rel = 0;
        collectorIds.forEach(cid => {
          col += (dailyCollectionMap.get(`${cid}_${d}`) || 0);
          rel += (dailyReleaseMap.get(`${cid}_${d}`) || 0);
        });

        const dayExpenses = {};
        let dayTotalExpense = 0;

        categories.forEach(cat => {
          const entry = dailyExpenseMap.get(`${Number(person.id)}_${d}_${cat.toLowerCase()}`);
          if (entry) {
            const amt = Number(entry.amount || 0);
            dayExpenses[cat] = {
              id: entry.id,
              amount: amt,
              description: entry.description || '',
              remarks: entry.remarks || '',
            };
            dayTotalExpense += amt;
            totals.categories[cat] = (totals.categories[cat] || 0) + amt;
          } else {
            dayExpenses[cat] = {
              id: null,
              amount: 0,
              description: '',
              remarks: '',
            };
          }
        });

        const dayNet = col - rel - dayTotalExpense;
        totals.collection += col;
        totals.release += rel;
        totals.total_expense += dayTotalExpense;
        totals.net += dayNet;

        days[d] = {
          date: d,
          collection: col,
          release: rel,
          expenses: dayExpenses,
          total_expense: dayTotalExpense,
          net: dayNet,
        };
      });

      return {
        personnel_id: person.id,
        employee_name: person.employee_name,
        position: person.position,
        collector_codes: matchingCollectors.map(c => c.collector_code).filter(Boolean),
        totals,
        days,
      };
    });

    res.json({
      date_from: dateFrom,
      date_to: dateTo,
      dates,
      categories: categoryList,
      personnel: personnelList,
      sheets,
    });
  } catch (err) { sendRouteError(res, err); }
});

router.post('/expenses/cell-update', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const personnelId = Number(req.body.personnel_id);
    const expenseDate = req.body.expense_date;
    const category = String(req.body.category || '').trim();
    const amount = Number(req.body.amount || 0);

    if (!personnelId || !expenseDate || !category) {
      return res.status(400).json({ error: 'Personnel ID, expense date, and category are required' });
    }

    const existing = await dbGet(`
      SELECT * FROM tblEmployeeExpense
      WHERE personnel_id = ? AND date(expense_date) = date(?) AND category = ? COLLATE NOCASE AND status = 'active'
      ORDER BY id DESC LIMIT 1
    `, [personnelId, expenseDate, category]);

    if (amount <= 0) {
      if (existing) {
        await dbRun(`
          UPDATE tblEmployeeExpense
          SET status = 'deleted', updated_by = ?, updated_at = datetime('now')
          WHERE id = ?
        `, [req.user.id, existing.id]);
      }
      return res.json({ success: true, deleted: true, id: existing?.id || null, amount: 0 });
    }

    const configuredCategory = await dbGet(`
      SELECT id FROM tblExpenseCategory WHERE category_name = ? COLLATE NOCASE AND status = 'active'
    `, [category]);
    if (!configuredCategory) {
      return res.status(400).json({ error: 'Please select an active expense category' });
    }

    if (existing) {
      await dbRun(`
        UPDATE tblEmployeeExpense
        SET amount = ?, description = COALESCE(?, description), remarks = COALESCE(?, remarks), updated_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [amount, req.body.description || null, req.body.remarks || null, req.user.id, existing.id]);
      const updated = await dbGet(`SELECT * FROM tblEmployeeExpense WHERE id = ?`, [existing.id]);
      return res.json({ success: true, entry: updated });
    } else {
      const result = await dbRun(`
        INSERT INTO tblEmployeeExpense (personnel_id, expense_date, category, description, amount, remarks, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [personnelId, expenseDate, category, req.body.description || null, amount, req.body.remarks || null, req.user.id, req.user.id]);
      const inserted = await dbGet(`SELECT * FROM tblEmployeeExpense WHERE id = ?`, [result.lastID]);
      return res.status(201).json({ success: true, entry: inserted });
    }
  } catch (err) { sendRouteError(res, err); }
});

router.get('/expenses/summary', authenticateToken, async (req, res) => {
  try {
    await ensureExpensesReportTables();
    const dateFrom = req.query.date_from || '';
    const dateTo = req.query.date_to || '';
    const params = [];
    const filters = [`ee.status = 'active'`];
    if (dateFrom) { filters.push(`date(ee.expense_date) >= date(?)`); params.push(dateFrom); }
    if (dateTo) { filters.push(`date(ee.expense_date) <= date(?)`); params.push(dateTo); }
    const whereSql = filters.join(' AND ');

    const rangeStart = dateFrom || '0001-01-01';
    const rangeEnd = dateTo || '9999-12-31';
    const [overall, byEmployee, byCategory, recent, configuredCollectors, systemCollectors, collectionPayments, releases, releaseCharges] = await Promise.all([
      dbGet(`
        SELECT COALESCE(SUM(amount), 0) as total_amount, COUNT(*) as expense_count
        FROM tblEmployeeExpense ee
        WHERE ${whereSql}
      `, params),
      dbAll(`
        SELECT ep.id as personnel_id, ep.employee_name, ep.position,
               COALESCE(SUM(ee.amount), 0) as total_amount,
               COUNT(ee.id) as expense_count
        FROM tblExpensePersonnel ep
        LEFT JOIN tblEmployeeExpense ee
          ON ee.personnel_id = ep.id
         AND ${whereSql}
        WHERE ep.status = 'active'
        GROUP BY ep.id
        ORDER BY total_amount DESC, ep.employee_name COLLATE NOCASE
      `, params),
      dbAll(`
        SELECT COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') as category,
               COALESCE(SUM(amount), 0) as total_amount,
               COUNT(*) as expense_count
        FROM tblEmployeeExpense ee
        WHERE ${whereSql}
        GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized')
        ORDER BY total_amount DESC
      `, params),
      dbAll(`
        SELECT ee.*, ep.employee_name, ep.position
        FROM tblEmployeeExpense ee
        JOIN tblExpensePersonnel ep ON ep.id = ee.personnel_id
        WHERE ${whereSql}
        ORDER BY date(ee.expense_date) DESC, ee.id DESC
        LIMIT 10
      `, params),
      dbAll(`
        SELECT id as personnel_id, employee_name, position
        FROM tblExpensePersonnel
        WHERE status = 'active' AND LOWER(TRIM(COALESCE(position, ''))) = 'collector'
        ORDER BY employee_name COLLATE NOCASE
      `),
      dbAll(`
        SELECT id as collector_id,
               TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) as collector_name
        FROM tblCollector
      `),
      dbAll(`
        SELECT COALESCE(c.collector_id, l.collector_id, p.collector_id) as collector_id,
               COALESCE(SUM(p.amount_paid), 0) as total_amount
        FROM tblPayment p
        LEFT JOIN tblLoan l ON l.id = p.loan_id
        LEFT JOIN tblCustomer c ON c.id = p.customer_id
        WHERE p.date_paid BETWEEN ? AND ?
          AND p.status IN ('active', 'penalty')
          AND ${buildCollectionPaymentExclusionSql('p')}
          AND ${sqlNotSunday('p.date_paid')}
        GROUP BY COALESCE(c.collector_id, l.collector_id, p.collector_id)
      `, [rangeStart, rangeEnd]),
      dbAll(`
        SELECT COALESCE(c.collector_id, l.collector_id) as collector_id,
               COALESCE(SUM(l.principal), 0) as total_amount
        FROM tblLoan l
        LEFT JOIN tblCustomer c ON c.id = l.customer_id
        WHERE l.date_released BETWEEN ? AND ?
          AND LOWER(COALESCE(l.status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled')
          AND LOWER(COALESCE(l.loan_type, '')) NOT LIKE '%recon%'
          AND ${sqlNotSunday('l.date_released')}
        GROUP BY COALESCE(c.collector_id, l.collector_id)
      `, [rangeStart, rangeEnd]),
      getCollectionReleaseCharges(rangeStart, rangeEnd),
    ]);

    const collectionByCollector = new Map(collectionPayments.map(row => [Number(row.collector_id), Number(row.total_amount || 0)]));
    releaseCharges.forEach(row => {
      const collectorId = Number(row.collector_id);
      if (!collectorId) return;
      collectionByCollector.set(collectorId, (collectionByCollector.get(collectorId) || 0) + Number(row.amount_paid || 0));
    });
    const releaseByCollector = new Map(releases.map(row => [Number(row.collector_id), Number(row.total_amount || 0)]));
    const expenseByPersonnel = new Map(byEmployee.map(row => [Number(row.personnel_id), Number(row.total_amount || 0)]));
    const netIncomeByCollector = configuredCollectors.map(personnel => {
      const collectorIds = systemCollectors
        .filter(collector => collectorNameMatchesPersonnel(collector.collector_name, personnel.employee_name))
        .map(collector => Number(collector.collector_id));
      const collectionAmount = collectorIds.reduce((sum, id) => sum + (collectionByCollector.get(id) || 0), 0);
      const releaseAmount = collectorIds.reduce((sum, id) => sum + (releaseByCollector.get(id) || 0), 0);
      const expenseAmount = expenseByPersonnel.get(Number(personnel.personnel_id)) || 0;
      return {
        ...personnel,
        collection_amount: collectionAmount,
        release_amount: releaseAmount,
        expense_amount: expenseAmount,
        net_income: collectionAmount - releaseAmount - expenseAmount,
      };
    }).sort((a, b) => Number(b.net_income || 0) - Number(a.net_income || 0));

    res.json({
      date_from: dateFrom,
      date_to: dateTo,
      total_amount: Number(overall?.total_amount || 0),
      expense_count: Number(overall?.expense_count || 0),
      by_employee: byEmployee,
      by_category: byCategory,
      net_income_by_collector: netIncomeByCollector,
      recent_expenses: recent,
    });
  } catch (err) { sendRouteError(res, err); }
});

// Manual past-due updater trigger (admin/manager)
router.post('/run-pastdue', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    await runPastDueUpdate();
    res.json({ message: 'Past-due update completed' });
  } catch (err) { sendRouteError(res, err); }
});

router.get('/customers-metrics', authenticateToken, async (req, res) => {
  try {
    res.json({
      total_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer`)).c,
      active_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active'`)).c,
      inactive_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='inactive'`)).c,
      new_this_month: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`)).c,
      new_last_month: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-1 month')`)).c
    });
  } catch (err) { sendRouteError(res, err); }
});

router.get('/dashboard/collection-trend', authenticateToken, async (req, res) => {
  try {
    res.json(await getCollectionTrend({ mode: req.query.mode, endDate: req.query.end_date || toLocalDateString() }));
  } catch (err) { sendRouteError(res, err); }
});

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const today = toLocalDateString();
    const now = new Date();
    
    // Find the most recent date before today that has active collections
    const latestPaymentDateRes = await dbGet(`SELECT MAX(date_paid) as max_date FROM tblPayment WHERE status IN ('active', 'penalty') AND ${buildCollectionPaymentExclusionSql()} AND date_paid < ? AND ${sqlNotSunday('date_paid')}`, [today]);
    const latestPaymentDate = req.query.date || latestPaymentDateRes?.max_date || getPreviousOperationDate(today);

    const epoch = new Date('2026-01-01T00:00:00Z');
    const diffDays = Math.floor((now - epoch) / (1000 * 60 * 60 * 24));
    const cycleIndex = Math.floor(diffDays / 45);
    const cycleStart = new Date(epoch.getTime() + cycleIndex * 45 * 24 * 60 * 60 * 1000);
    const cycleEnd = new Date(cycleStart.getTime() + 44 * 24 * 60 * 60 * 1000);
    const cycleStartStr = cycleStart.toISOString().split('T')[0];
    const cycleEndStr = cycleEnd.toISOString().split('T')[0];

    try {
      await synchronizePromiseToPayStatuses();
    } catch (e) {
      console.error('PTP Sync error on dashboard:', e.message);
    }

    const ptpCounts = await dbGet(`
      SELECT 
        SUM(CASE WHEN status IN ('Pending', 'Due Today', 'Overdue PTP') AND (date(promise_date) < date(?) OR date(follow_up_date) < date(?)) THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN status IN ('Pending', 'Due Today', 'Overdue PTP') AND (date(promise_date) = date(?) OR date(follow_up_date) = date(?)) THEN 1 ELSE 0 END) as due_today_count,
        COUNT(*) as total_count
      FROM tblPromiseToPay
      WHERE status IN ('Pending', 'Due Today', 'Overdue PTP')
    `, [today, today, today, today]);

    const ptpDueToday = Number(ptpCounts?.due_today_count || 0);
    const ptpOverdue = Number(ptpCounts?.overdue_count || 0);
    const ptpDueTotal = ptpDueToday + ptpOverdue;

    const demandRows = await dbAll(`
      SELECT id, status, follow_up_date, date_received
      FROM tblDemandLetter
      WHERE (
          (follow_up_date != '' AND follow_up_date <= ?)
          OR COALESCE(status, '') IN ('Sent', 'Awaiting Receipt', 'Generated', 'Pending', 'Urgent Action Require', '2nd Demand on Process', 'For Follow-up', 'Follow-up Due')
        )
        AND COALESCE(status, '') NOT IN (
          'Draft', 'Closed', 'Superseded',
          'Settled(Recon)', 'Settled(Reloan)', 'Settled(Fully Paid)'
        )
    `, [today]);

    const activeDemandRows = demandRows.filter(row => !String(row.status || '').toLowerCase().startsWith('settled('));
    const demandDueFollowups = activeDemandRows.filter(row => {
      const followUpDate = String(row.follow_up_date || '').slice(0, 10);
      return Boolean(row.date_received && followUpDate && followUpDate <= today);
    });
    const demandAwaitingReceipt = activeDemandRows.filter(row => {
      const isDue = Boolean(row.date_received && String(row.follow_up_date || '').slice(0, 10) <= today);
      return !isDue;
    });
    const demandDueTodayCount = demandDueFollowups.filter(row => String(row.follow_up_date || '').slice(0, 10) === today).length;
    const demandOverdueCount = demandDueFollowups.filter(row => String(row.follow_up_date || '').slice(0, 10) < today).length;

    res.json({
      weekly_collection_trend: (await getCollectionTrend({ mode: 'daily', endDate: today })).rows,
      cycle_start: cycleStartStr,
      cycle_end: cycleEndStr,
      total_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active'`)).c,
      new_customers_this_month: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`)).c,
      expected_collections_today: (await dbGet(`SELECT COALESCE(SUM(amortization), 0) as total FROM tblLoan WHERE status='active'`)).total,
      collections_this_month: (await dbGet(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM tblPayment WHERE status IN ('active', 'penalty') AND ${buildCollectionPaymentExclusionSql()} AND strftime('%Y-%m', date_paid) = strftime('%Y-%m', 'now') AND ${sqlNotSunday('date_paid')}`)).total,
      collections_last_month: (await dbGet(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM tblPayment WHERE status IN ('active', 'penalty') AND ${buildCollectionPaymentExclusionSql()} AND strftime('%Y-%m', date_paid) = strftime('%Y-%m', 'now', '-1 month') AND ${sqlNotSunday('date_paid')}`)).total,
      demand_letters_sent: 0,
      total_active_loans: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='active'`)).c,
      total_pastdue: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE date_maturity < ? AND LOWER(COALESCE(status, '')) NOT IN ('fullpaid', 'fully_paid', 'reversed', 'rejected', 'cancelled', 'canceled')`, [today])).c,
      total_pastdue_amount: (await dbGet(`SELECT COALESCE(SUM(balance), 0) as total FROM tblLoan WHERE date_maturity < ? AND LOWER(COALESCE(status, '')) NOT IN ('fullpaid', 'fully_paid', 'reversed', 'rejected', 'cancelled', 'canceled')`, [today])).total,
      total_fullpaid: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='fullpaid'`)).c,
      collections_today: (await dbGet(`SELECT COALESCE(SUM(amount_paid),0) as total FROM tblPayment WHERE date_paid=? AND status IN ('active', 'penalty') AND ${buildCollectionPaymentExclusionSql()} AND ${sqlNotSunday('date_paid')}`, [today])).total,
      collections_yesterday: (await dbGet(`SELECT COALESCE(SUM(amount_paid),0) as total FROM tblPayment WHERE date_paid=? AND status IN ('active', 'penalty') AND ${buildCollectionPaymentExclusionSql()} AND ${sqlNotSunday('date_paid')}`, [latestPaymentDate])).total,
      yesterday_str: latestPaymentDate,
      releases_today: (await dbGet(`SELECT COALESCE(SUM(principal),0) as total FROM tblLoan WHERE date_released = ? AND LOWER(COALESCE(status, '')) IN ('active', 'fully_paid', 'fullpaid') AND ${sqlNotSunday('date_released')}`, [today])).total,
      loans_released_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE date_released = ? AND LOWER(COALESCE(status, '')) IN ('active', 'fully_paid', 'fullpaid') AND ${sqlNotSunday('date_released')}`, [today])).c,
      total_portfolio: (await dbGet(`SELECT COALESCE(SUM(balance),0) as total FROM tblLoan WHERE status IN ('active','pastdue')`)).total,
      fully_paid_today: (await dbGet(`SELECT COUNT(DISTINCT customer_id) as c FROM tblCustomerStatusHistory WHERE new_status='FULLY PAID' AND date(created_at) = date('now', 'localtime')`)).c,
      eligible_for_reloan: (await dbGet(`
        SELECT COUNT(*) as c
        FROM tblCustomer c
        WHERE UPPER(c.status) IN ('FULLY PAID', 'RELAX')
          AND NOT EXISTS (
            SELECT 1
            FROM tblLoan l
            WHERE l.customer_id = c.id
              AND LOWER(l.status) IN ('active', 'pastdue')
              AND COALESCE(l.balance, 0) > 0
          )
      `)).c,
      recon_count: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='RECON'`)).c,
      relax_count: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='RELAX'`)).c,
      hold_count: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='hold'`)).c,
      collector_performance: await dbAll(`
        SELECT 
          co.id, 
          co.first_name || ' ' || co.last_name as name,
          COALESCE((
            SELECT SUM(target_loans.amortization)
            FROM (
              SELECT DISTINCT l.id, l.amortization
              FROM tblLoan l
              WHERE l.collector_id = co.id
                AND (l.date_released IS NULL OR l.date_released <= ?)
                AND LOWER(l.status) IN ('active', 'pastdue')
                AND COALESCE(l.balance, 0) > 0
                AND LOWER(COALESCE(l.loan_type, '')) NOT LIKE '%recon%'
                AND (
                  l.date_maturity IS NULL
                  OR CAST(ROUND(JULIANDAY(?) - JULIANDAY(l.date_maturity)) AS INTEGER) < 45
                )
            ) target_loans
          ), 0) as target,
          COALESCE((
            SELECT SUM(amount_paid)
            FROM tblPayment
            WHERE collector_id = co.id
              AND date_paid = ?
              AND status IN ('active', 'penalty')
              AND ${buildCollectionPaymentExclusionSql()}
              AND ${sqlNotSunday('date_paid')}
          ), 0) as collected
        FROM tblCollector co
        WHERE co.is_active = 1
        AND LOWER(co.first_name || ' ' || co.last_name) NOT LIKE '%pastdue%'
        ORDER BY collected DESC
      `, [latestPaymentDate, latestPaymentDate, latestPaymentDate]),
      recent_activities: await dbAll(`SELECT * FROM tblLogtime ORDER BY created_at DESC LIMIT 10`),
      pending_ci: await dbAll(`SELECT l.id, c.full_name, l.principal, l.created_at FROM tblLoan l JOIN tblCustomer c ON l.customer_id = c.id WHERE l.status = 'pending' ORDER BY l.created_at DESC LIMIT 5`),
      pending_ci_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='pending'`)).c,
      for_approval_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='for_approval'`)).c,
      pending_reloan_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='reloan_pending'`)).c,
      approved_reloan_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='approved' AND LOWER(REPLACE(REPLACE(COALESCE(loan_type, ''), '-', ''), ' ', ''))='reloan'`)).c,
      rejected_reloan_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='rejected' AND LOWER(REPLACE(REPLACE(COALESCE(loan_type, ''), '-', ''), ' ', ''))='reloan'`)).c,
      approved_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='approved' AND DATE(updated_at)=?`, [today])).c,
      rejected_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='rejected' AND DATE(updated_at)=?`, [today])).c,
      monitoring_alerts_active: (await dbGet(`
        SELECT COUNT(*) as c
        FROM tblMonitoringAlert m
        JOIN tblCustomer c ON m.customer_id = c.id
        JOIN tblLoan l ON m.loan_id = l.id
        WHERE m.status = 'Active'
          AND ${buildMonitoringEligibilityCondition()}
      `, [today])).c,
      monitoring_alerts_escalated: (await dbGet(`
        SELECT COUNT(*) as c
        FROM tblMonitoringAlert m
        JOIN tblCustomer c ON m.customer_id = c.id
        JOIN tblLoan l ON m.loan_id = l.id
        WHERE m.status = 'Active'
          AND m.alert_level = 'Day 4+'
          AND ${buildMonitoringEligibilityCondition()}
      `, [today])).c,
      monitoring_alerts_resolved_today: (await dbGet(`
        SELECT COUNT(*) as c
        FROM tblMonitoringAlert m
        JOIN tblCustomer c ON m.customer_id = c.id
        JOIN tblLoan l ON m.loan_id = l.id
        WHERE m.status = 'Resolved'
          AND DATE(m.resolved_at) = ?
          AND ${buildMonitoringEligibilityCondition()}
      `, [today, today])).c,
      ptp_due_today: ptpDueToday,
      ptp_overdue: ptpOverdue,
      ptp_due_count: ptpDueTotal,
      ptp_active_count: Number(ptpCounts?.total_count || 0),
      demand_letters_active: activeDemandRows.length,
      demand_letters_due_today: demandDueTodayCount,
      demand_letters_overdue: demandOverdueCount,
      demand_letters_due_count: demandDueFollowups.length,
      account_status_distribution: [
        {
          status: 'active',
          count: Number((await dbGet(`
            SELECT COUNT(*) as c
            FROM tblLoan
            WHERE LOWER(COALESCE(status, '')) IN ('active', 'pastdue')
              AND (date_maturity >= ? OR date_maturity IS NULL)
              AND COALESCE(balance, 0) > 0
          `, [today]))?.c || 0)
        },
        {
          status: 'pastdue',
          count: Number((await dbGet(`
            SELECT COUNT(*) as c
            FROM tblLoan
            WHERE date_maturity < ?
              AND LOWER(COALESCE(status, '')) NOT IN ('fullpaid', 'fully_paid', 'reversed', 'rejected', 'cancelled', 'canceled')
              AND COALESCE(balance, 0) > 0
          `, [today]))?.c || 0)
        },
        {
          status: 'fullpaid',
          count: Number((await dbGet(`
            SELECT COUNT(*) as c
            FROM tblLoan
            WHERE LOWER(COALESCE(status, '')) IN ('fullpaid', 'fully_paid')
               OR (LOWER(COALESCE(status, '')) IN ('active', 'pastdue') AND COALESCE(balance, 0) <= 0)
          `))?.c || 0)
        },
        {
          status: 'pending',
          count: Number((await dbGet(`
            SELECT COUNT(*) as c
            FROM tblLoan
            WHERE LOWER(COALESCE(status, '')) IN ('pending', 'for_approval', 'reloan_pending', 'approved')
          `))?.c || 0)
        }
      ],
      aging_report: await dbGet(`
        SELECT 
          SUM(CASE WHEN days_overdue BETWEEN 1 AND 30 THEN 1 ELSE 0 END) as tier1,
          SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN 1 ELSE 0 END) as tier2,
          SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as tier3,
          SUM(CASE WHEN days_overdue > 90 THEN 1 ELSE 0 END) as tier4
        FROM (
          SELECT CAST(ROUND(JULIANDAY(?) - JULIANDAY(date_maturity)) AS INTEGER) as days_overdue
          FROM tblLoan WHERE LOWER(COALESCE(status, '')) NOT IN ('fullpaid', 'fully_paid', 'reversed', 'rejected', 'cancelled', 'canceled') AND date_maturity < ?
        )
      `, [today, today])
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/daily-collection', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const payments = await dbAll(`
      SELECT p.id,
             p.loan_id,
             p.customer_id,
             p.or_number,
             p.payment_code,
             p.date_paid,
             p.amount_paid,
             p.balance_after,
             p.payment_type,
             l.loan_code,
             l.loan_type,
             l.date_maturity,
             CAST(MAX(0, ROUND(JULIANDAY(p.date_paid) - JULIANDAY(l.date_maturity))) AS INTEGER) as days_past_due,
             c.full_name as customer_name,
             c.customer_code,
             COALESCE(
               NULLIF(TRIM(cco.first_name || ' ' || cco.last_name), ''),
               NULLIF(TRIM(lco.first_name || ' ' || lco.last_name), ''),
               NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
               'Unassigned'
             ) as collector_name
      FROM tblPayment p
      LEFT JOIN tblLoan l ON p.loan_id = l.id
      LEFT JOIN tblCustomer c ON p.customer_id = c.id
      LEFT JOIN tblCollector co ON p.collector_id = co.id
      LEFT JOIN tblCollector lco ON l.collector_id = lco.id
      LEFT JOIN tblCollector cco ON c.collector_id = cco.id
      WHERE p.date_paid BETWEEN ? AND ?
        AND p.status IN ('active', 'penalty')
        AND ${buildCollectionPaymentExclusionSql('p')}
        AND ${sqlNotSunday('p.date_paid')}
      ORDER BY p.date_paid, collector_name, c.full_name
    `, [from, to]);
    const releaseCharges = await getCollectionReleaseCharges(from, to);
    const collectionRows = [...payments, ...releaseCharges]
      .map(row => ({ ...row, collector_name: normalizeCollectorReportName(row.collector_name) }))
      .sort((a, b) =>
        String(a.date_paid || '').localeCompare(String(b.date_paid || '')) ||
        String(a.collector_name || '').localeCompare(String(b.collector_name || '')) ||
        String(a.customer_name || '').localeCompare(String(b.customer_name || ''))
      );
    res.json({ payments: collectionRows, total: collectionRows.reduce((s, p) => s + Number(p.amount_paid || 0), 0), date_from: from, date_to: to });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/collection-sheet/advance-client', authenticateToken, async (req, res) => {
  try {
    const clientCode = String(req.query.client_code || '').trim();
    if (!clientCode) return res.status(400).json({ error: 'Client Code is required' });

    const client = await dbGet(`
      SELECT
        c.id AS customer_id,
        c.customer_code,
        COALESCE(NULLIF(c.full_name, ''), TRIM(c.first_name || ' ' || c.last_name)) AS customer_name,
        l.id AS loan_id,
        l.loan_code,
        l.loan_type,
        COALESCE(l.collector_id, c.collector_id) AS collector_id,
        COALESCE(
          NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
          'Unassigned'
        ) AS collector_name
      FROM tblCustomer c
      JOIN tblLoan l ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON co.id = COALESCE(l.collector_id, c.collector_id)
      WHERE LOWER(TRIM(c.customer_code)) = LOWER(?)
        AND LOWER(COALESCE(l.status, '')) IN ('active', 'pastdue')
        AND COALESCE(l.balance, 0) > 0
      ORDER BY CASE WHEN LOWER(l.status) = 'active' THEN 0 ELSE 1 END,
               date(COALESCE(l.date_released, l.created_at)) DESC,
               l.id DESC
      LIMIT 1
    `, [clientCode]);

    if (!client) return res.status(404).json({ error: 'No active loan found for this Client Code' });
    if (!client.collector_id) return res.status(400).json({ error: 'The selected client has no assigned collector' });
    res.json(client);
  } catch (err) { sendRouteError(res, err); }
});

router.get('/collection-sheet/advance-manual', authenticateToken, async (req, res) => {
  try {
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];
    requireOperationDate(targetDate, 'Advance entry date');
    await ensureCollectionAdvanceManualTable();

    const entries = await dbAll(`
      SELECT
        a.id,
        a.customer_id,
        a.loan_id,
        a.collector_id,
        a.report_date,
        a.amount,
        a.created_at,
        a.updated_at,
        c.customer_code,
        COALESCE(NULLIF(c.full_name, ''), TRIM(c.first_name || ' ' || c.last_name)) AS customer_name,
        l.loan_code,
        l.loan_type,
        COALESCE(NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''), 'Unassigned') AS collector_name
      FROM tblCollectionAdvanceManual a
      JOIN tblCustomer c ON c.id = a.customer_id
      JOIN tblLoan l ON l.id = a.loan_id
      LEFT JOIN tblCollector co ON co.id = a.collector_id
      WHERE a.report_date = ?
      ORDER BY datetime(a.updated_at) DESC, a.id DESC
    `, [targetDate]);

    res.json({ date: targetDate, entries });
  } catch (err) { sendRouteError(res, err); }
});

router.post('/collection-sheet/advance-manual', authenticateToken, async (req, res) => {
  try {
    const targetDate = req.body.date || new Date().toISOString().split('T')[0];
    const customerId = Number(req.body.customer_id);
    const loanId = Number(req.body.loan_id);
    const amount = Number(req.body.amount);
    requireOperationDate(targetDate, 'Advance entry date');
    if (!customerId || !loanId) return res.status(400).json({ error: 'A valid client and loan are required' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });

    const loan = await dbGet(`
      SELECT
        l.id AS loan_id,
        l.loan_code,
        l.loan_type,
        c.id AS customer_id,
        c.customer_code,
        COALESCE(NULLIF(c.full_name, ''), TRIM(c.first_name || ' ' || c.last_name)) AS customer_name,
        COALESCE(l.collector_id, c.collector_id) AS collector_id,
        COALESCE(NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''), 'Unassigned') AS collector_name
      FROM tblLoan l
      JOIN tblCustomer c ON c.id = l.customer_id
      LEFT JOIN tblCollector co ON co.id = COALESCE(l.collector_id, c.collector_id)
      WHERE l.id = ?
        AND c.id = ?
        AND LOWER(COALESCE(l.status, '')) IN ('active', 'pastdue')
        AND COALESCE(l.balance, 0) > 0
    `, [loanId, customerId]);
    if (!loan) return res.status(404).json({ error: 'The selected active loan was not found' });
    if (!loan.collector_id) return res.status(400).json({ error: 'The selected client has no assigned collector' });

    await ensureCollectionAdvanceManualTable();
    await dbRun(`
      INSERT INTO tblCollectionAdvanceManual (
        customer_id, loan_id, collector_id, report_date, amount, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(loan_id, report_date)
      DO UPDATE SET
        customer_id = excluded.customer_id,
        collector_id = excluded.collector_id,
        amount = excluded.amount,
        updated_by = excluded.updated_by,
        updated_at = datetime('now')
    `, [customerId, loanId, loan.collector_id, targetDate, amount, req.user.id, req.user.id]);

    const saved = await dbGet(`
      SELECT * FROM tblCollectionAdvanceManual WHERE loan_id = ? AND report_date = ?
    `, [loanId, targetDate]);
    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
      [req.user.id, req.user.username, 'UPSERT', 'COLLECTION_SHEET_ADVANCE', saved.id,
        `Adv. ${amount} entered for ${loan.customer_name} (${loan.loan_code}) on ${targetDate}`]
    );

    res.status(201).json({
      message: 'Advance entry saved successfully',
      entry: saved,
      client: loan,
    });
  } catch (err) { sendRouteError(res, err); }
});

router.put('/collection-sheet/advance-manual/:id', authenticateToken, async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    const amount = Number(req.body.amount);
    if (!entryId) return res.status(400).json({ error: 'A valid advance entry is required' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });
    await ensureCollectionAdvanceManualTable();

    const existing = await dbGet(`
      SELECT a.*, c.full_name AS customer_name, l.loan_code
      FROM tblCollectionAdvanceManual a
      JOIN tblCustomer c ON c.id = a.customer_id
      JOIN tblLoan l ON l.id = a.loan_id
      WHERE a.id = ?
    `, [entryId]);
    if (!existing) return res.status(404).json({ error: 'Advance entry not found' });

    await dbRun(`
      UPDATE tblCollectionAdvanceManual
      SET amount = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [amount, req.user.id, entryId]);
    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
      [req.user.id, req.user.username, 'UPDATE', 'COLLECTION_SHEET_ADVANCE', entryId,
        `Adv. entry changed from ${existing.amount} to ${amount} for ${existing.customer_name} (${existing.loan_code}) on ${existing.report_date}`]
    );

    res.json({ message: 'Advance entry updated successfully', id: entryId, amount });
  } catch (err) { sendRouteError(res, err); }
});

router.get('/collection-sheet/config', authenticateToken, async (req, res) => {
  try {
    const rows = await dbAll(`SELECT setting_key, setting_value FROM tblSystemSettings WHERE setting_key IN ('cs_checked_by', 'cs_encoded_by', 'cs_approved_by')`);
    const map = Object.fromEntries((rows || []).map(r => [r.setting_key, r.setting_value]));
    res.json({
      checkedBy: map.cs_checked_by || 'MARILYN O. RELOBA',
      encodedBy: map.cs_encoded_by || 'IT/ACCOUNTING CLERK',
      approvedBy: map.cs_approved_by || 'VICTORIO L. RELOBA JR.'
    });
  } catch (err) { sendRouteError(res, err); }
});

router.put('/collection-sheet/config', authenticateToken, async (req, res) => {
  try {
    const { checkedBy, encodedBy, approvedBy } = req.body || {};
    const updates = [
      { key: 'cs_checked_by', val: checkedBy !== undefined && checkedBy !== null ? String(checkedBy).trim() : 'MARILYN O. RELOBA', desc: 'Collection Sheet Checked By Signatory' },
      { key: 'cs_encoded_by', val: encodedBy !== undefined && encodedBy !== null ? String(encodedBy).trim() : 'IT/ACCOUNTING CLERK', desc: 'Collection Sheet Encoded By Signatory' },
      { key: 'cs_approved_by', val: approvedBy !== undefined && approvedBy !== null ? String(approvedBy).trim() : 'VICTORIO L. RELOBA JR.', desc: 'Collection Sheet Approved By Signatory' }
    ];

    for (const item of updates) {
      await dbRun(`
        INSERT INTO tblSystemSettings (setting_key, setting_value, description, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = excluded.updated_at
      `, [item.key, item.val, item.desc]);
    }

    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
      [req.user.id, req.user.username, 'UPDATE', 'COLLECTION_SHEET_CONFIG', 0,
        `CS Signatures updated: Checked by="${updates[0].val}", Encoded by="${updates[1].val}", Approved by="${updates[2].val}"`]
    );

    res.json({
      message: 'Collection sheet configuration updated successfully',
      signatures: {
        checkedBy: updates[0].val || 'MARILYN O. RELOBA',
        encodedBy: updates[1].val || 'IT/ACCOUNTING CLERK',
        approvedBy: updates[2].val || 'VICTORIO L. RELOBA JR.'
      }
    });
  } catch (err) { sendRouteError(res, err); }
});

router.delete('/collection-sheet/advance-manual/:id', authenticateToken, async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    if (!entryId) return res.status(400).json({ error: 'A valid advance entry is required' });
    await ensureCollectionAdvanceManualTable();

    const existing = await dbGet(`
      SELECT a.*, c.full_name AS customer_name, l.loan_code
      FROM tblCollectionAdvanceManual a
      JOIN tblCustomer c ON c.id = a.customer_id
      JOIN tblLoan l ON l.id = a.loan_id
      WHERE a.id = ?
    `, [entryId]);
    if (!existing) return res.status(404).json({ error: 'Advance entry not found' });

    await dbRun(`DELETE FROM tblCollectionAdvanceManual WHERE id = ?`, [entryId]);
    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
      [req.user.id, req.user.username, 'DELETE', 'COLLECTION_SHEET_ADVANCE', entryId,
        `Adv. ${existing.amount} deleted for ${existing.customer_name} (${existing.loan_code}) on ${existing.report_date}`]
    );

    res.json({ message: 'Advance entry deleted successfully', collector_id: existing.collector_id });
  } catch (err) { sendRouteError(res, err); }
});

router.get('/monthly-releases', authenticateToken, async (req, res) => {
  try {
    const y = String(req.query.year || new Date().getFullYear());
    const m = String(req.query.month || (new Date().getMonth() + 1)).padStart(2, '0');
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE strftime('%Y',l.date_released)=? AND strftime('%m',l.date_released)=? AND LOWER(COALESCE(l.status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled') AND ${sqlNotSunday('l.date_released')} ORDER BY l.date_released`, [y, m]);
    res.json({ loans, total_principal: loans.reduce((s, l) => s + l.principal, 0), year: y, month: m });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/release-report', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const loans = await dbAll(`
      SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE l.date_released BETWEEN ? AND ?
        AND LOWER(COALESCE(l.status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled')
        AND ${sqlNotSunday('l.date_released')}
      ORDER BY l.date_released, co.last_name, c.full_name
    `, [from, to]);
    res.json({ loans, total_principal: loans.reduce((s, l) => s + Number(l.principal || 0), 0), date_from: from, date_to: to });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/past-due', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const loans = await dbAll(`
      SELECT l.*, c.full_name as customer_name, c.customer_code, c.address, c.contact,
             co.first_name || ' ' || co.last_name as collector_name,
             CAST(ROUND(JULIANDAY('now') - JULIANDAY(l.date_maturity)) AS INTEGER) as days_overdue
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE l.date_maturity BETWEEN ? AND ?
        AND l.status IN ('active','pastdue')
        AND COALESCE(l.balance, 0) > 0
      ORDER BY co.last_name, c.full_name, l.date_maturity ASC
    `, [from, to]);
    res.json({
      loans,
      date_from: from,
      date_to: to,
      total_balance: loans.reduce((s, l) => s + Number(l.balance || 0), 0),
      total_principal: loans.reduce((s, l) => s + Number(l.principal || 0), 0),
      total_interest: loans.reduce((s, l) => s + Number(l.interest_amount || 0), 0)
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/payments-encoded', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const data = await dbAll(`SELECT p.*, l.loan_code, c.full_name as customer_name, u.full_name as encoded_by_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblUser u ON p.encoded_by = u.id WHERE p.date_paid BETWEEN ? AND ? AND p.status IN ('active', 'penalty') AND ${buildCollectionPaymentExclusionSql('p')} AND ${sqlNotSunday('p.date_paid')} ORDER BY p.created_at`, [from, to]);
    res.json({ data, total: data.reduce((s, p) => s + p.amount_paid, 0) });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/payments-reversed', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const data = await dbAll(`
      SELECT p.*, l.loan_code, l.loan_type,
             c.full_name as customer_name, c.customer_code,
             co.first_name || ' ' || co.last_name as collector_name,
             u.full_name as reversed_by_name,
             p.reversal_reason
      FROM tblPayment p
      LEFT JOIN tblLoan l ON p.loan_id = l.id
      LEFT JOIN tblCustomer c ON p.customer_id = c.id
      LEFT JOIN tblCollector co ON p.collector_id = co.id
      LEFT JOIN tblUser u ON p.reversed_by = u.id
      WHERE p.status = 'reversed' AND DATE(p.reversed_at) BETWEEN ? AND ?
      ORDER BY co.last_name, p.reversed_at DESC
    `, [from, to]);
    res.json({
      payments: data,
      total: data.reduce((s, p) => s + Number(p.amount_paid || 0), 0),
      date_from: from,
      date_to: to
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/maturity-check', authenticateToken, async (req, res) => {
  try {
    const days = req.query.days_ahead || 30;
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name, c.contact, co.first_name || ' ' || co.last_name as collector_name, CAST(ROUND(JULIANDAY(l.date_maturity) - JULIANDAY('now')) AS INTEGER) as days_to_maturity FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.status = 'active' AND JULIANDAY(l.date_maturity) - JULIANDAY('now') BETWEEN 0 AND ? ORDER BY l.date_maturity ASC`, [days]);
    res.json({ loans, days_ahead: days });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/full-paid', authenticateToken, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let q = `SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.status = 'fullpaid'`;
    const p = [];
    if (date_from) { q += ` AND DATE(l.updated_at) >= ?`; p.push(date_from); }
    if (date_to) { q += ` AND DATE(l.updated_at) <= ?`; p.push(date_to); }
    q += ` ORDER BY l.updated_at DESC`;
    const loans = await dbAll(q, p);
    res.json({
      loans,
      total_principal: loans.reduce((s, l) => s + Number(l.principal || 0), 0),
      date_from,
      date_to
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/loan-type', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const loans = await dbAll(`
      SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE l.date_released BETWEEN ? AND ?
        AND LOWER(COALESCE(l.status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled')
        AND ${sqlNotSunday('l.date_released')}
      ORDER BY l.date_released, co.last_name, c.full_name
    `, [from, to]);
    res.json({ loans, date_from: from, date_to: to });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/collection-sheet', authenticateToken, async (req, res) => {
  try {
    const { collector_id, date } = req.query;
    if (!collector_id) return res.status(400).json({ error: 'Please select a collector' });
    const collectorId = Number(collector_id);
    if (!collectorId) return res.status(400).json({ error: 'Invalid collector' });
    const targetDate = date || new Date().toISOString().split('T')[0];
    requireOperationDate(targetDate, 'Collection sheet date');
    await ensureCollectionFieldReleaseTables();
    await ensureCollectionAdvanceManualTable();

    // Get collector info
    const collector = await dbGet(`SELECT id, collector_code, first_name, last_name FROM tblCollector WHERE id = ?`, [collectorId]);
    const collectorName = collector ? `${collector.last_name}, ${collector.first_name}`.toUpperCase() : 'UNASSIGNED';
    const collectorProfile = await dbGet('SELECT profile_json FROM tblCollectorPerformanceProfile WHERE collector_id = ?', [collectorId]);
    let includeReconInDailyTarget = false;
    try {
      includeReconInDailyTarget = JSON.parse(collectorProfile?.profile_json || '{}').includeReconInDailyTarget === true;
    } catch { /* An invalid legacy profile simply uses the standard target. */ }

    // Get active/pastdue loans with collected amounts for the date
    const loans = await dbAll(`
      SELECT l.id, l.loan_code, l.customer_id, l.loan_type, l.principal, l.amortization,
        l.date_released, l.date_maturity, l.balance, l.total_paid, l.status, l.insurance,
        COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown') as customer_name,
        c.first_name,
        c.last_name,
        c.middle_name,
        c.customer_code,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date(date_paid) = date(?) AND status IN ('active', 'penalty') AND ${buildCollectionPaymentExclusionSql()} AND ${sqlNotSunday('date_paid')}) as collected_today,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date(date_paid) = date(?) AND status = 'active' AND ${buildCollectionPaymentExclusionSql()} AND LOWER(COALESCE(remarks, '')) LIKE '%old balance%' AND ${sqlNotSunday('date_paid')}) as balance_collected_today,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date(date_paid) = date(?) AND status = 'penalty' AND ${sqlNotSunday('date_paid')}) as penalty_collected_today
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      WHERE COALESCE(l.collector_id, c.collector_id) = ?
        AND (
          (LOWER(l.status) IN ('active', 'pastdue') AND COALESCE(l.balance, 0) > 0)
          OR EXISTS (
            SELECT 1 FROM tblPayment p
            WHERE p.loan_id = l.id
              AND date(p.date_paid) = date(?)
              AND p.status IN ('active', 'penalty')
              AND ${buildCollectionPaymentExclusionSql('p')}
              AND ${sqlNotSunday('p.date_paid')}
          )
        )
      ORDER BY c.full_name ASC
    `, [targetDate, targetDate, targetDate, collectorId, targetDate]);

    const advanceRows = await dbAll(`
      SELECT loan_id, COALESCE(SUM(amount), 0) AS amount
      FROM tblCollectionAdvanceManual
      WHERE collector_id = ? AND report_date = ?
      GROUP BY loan_id
    `, [collectorId, targetDate]);
    const advanceByLoan = new Map(advanceRows.map(row => [Number(row.loan_id), Number(row.amount || 0)]));
    loans.forEach(loan => {
      loan.advance_manual_today = advanceByLoan.get(Number(loan.id)) || 0;
    });

    // Compute days past due for each loan
    const refDate = new Date(targetDate + 'T00:00:00');
    loans.forEach(l => {
      let dpd = 0;
      if (l.date_maturity) {
        const mat = new Date(l.date_maturity + 'T00:00:00');
        if (refDate > mat) {
          dpd = Math.floor((refDate - mat) / (1000 * 60 * 60 * 24));
        }
      }
      l.days_past_due = Math.max(0, dpd);
    });

    const loansByCustomer = loans.reduce((acc, loan) => {
      if (!acc.has(loan.customer_id)) acc.set(loan.customer_id, []);
      acc.get(loan.customer_id).push(loan);
      return acc;
    }, new Map());

    const collectionLoans = [];
    loansByCustomer.forEach(customerLoans => {
      const activeTransferLoan = customerLoans.find(loan =>
        String(loan.status || '').toLowerCase() === 'active' &&
        ['reloan', 'recon'].includes(String(loan.loan_type || '').toLowerCase().replace(/[^a-z0-9]/g, '')) &&
        toDateKey(loan.date_released) === targetDate
      );

      if (!activeTransferLoan) {
        collectionLoans.push(...customerLoans);
        return;
      }

      const priorCollections = customerLoans
        .filter(loan => loan.id !== activeTransferLoan.id && String(loan.status || '').toLowerCase() === 'fullpaid')
        .reduce((totals, loan) => {
          totals.balance += Number(loan.balance_collected_today || 0);
          totals.penalty += Number(loan.penalty_collected_today || 0);
          return totals;
        }, { balance: 0, penalty: 0 });

      activeTransferLoan.reloan_balance_note = priorCollections.balance;
      activeTransferLoan.reloan_penalty_note = priorCollections.penalty;
      collectionLoans.push(activeTransferLoan);
      collectionLoans.push(...customerLoans.filter(loan =>
        loan.id !== activeTransferLoan.id &&
        String(loan.status || '').toLowerCase() !== 'fullpaid'
      ));
    });

    const pbInsDst = await dbGet(`
      SELECT COALESCE(SUM(passbook), 0) as total
      FROM tblLoan
      WHERE collector_id = ?
        AND date(date_released) = date(?)
        AND LOWER(COALESCE(status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled')
        AND COALESCE(passbook, 0) > 0
        AND ${sqlNotSunday('date_released')}
    `, [collectorId, targetDate]);
    const pbInsDstTotal = Number(pbInsDst?.total || 0);
    const fieldRelease = await dbGet(`
      SELECT COALESCE(amount, 0) as amount
      FROM tblCollectionFieldRelease
      WHERE collector_id = ?
        AND report_date = ?
    `, [collectorId, targetDate]);
    const fieldReleaseTotal = Number(fieldRelease?.amount || 0);

    // Calculate summary totals
    const totalCollection = collectionLoans.reduce((s, l) => s + Number(l.collected_today || 0), 0);

    const csSettingsRows = await dbAll(`SELECT setting_key, setting_value FROM tblSystemSettings WHERE setting_key IN ('cs_checked_by', 'cs_encoded_by', 'cs_approved_by')`);
    const csMap = Object.fromEntries((csSettingsRows || []).map(r => [r.setting_key, r.setting_value]));

    res.json({
      loans: collectionLoans,
      collector_id: collectorId,
      include_recon_in_daily_target: includeReconInDailyTarget,
      date: targetDate,
      collector: { id: collector?.id, name: collectorName },
      summary: {
        totalCollection,
        pbInsDst: pbInsDstTotal,
        passbookTotal: pbInsDstTotal,
        fieldRelease: fieldReleaseTotal,
        totalExpense: 0,
        grandTotal: totalCollection + pbInsDstTotal - fieldReleaseTotal
      },
      signatures: {
        checkedBy: csMap.cs_checked_by || 'MARILYN O. RELOBA',
        encodedBy: csMap.cs_encoded_by || 'IT/ACCOUNTING CLERK',
        approvedBy: csMap.cs_approved_by || 'VICTORIO L. RELOBA JR.'
      }
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/disclosure-statement', authenticateToken, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const selectedLoanId = req.query.loan_id ? Number(req.query.loan_id) : null;

    if (!search && !selectedLoanId) {
      return res.status(400).json({ error: 'Search client code or name first' });
    }

    const baseSelect = `
      SELECT
        l.*,
        c.customer_code,
        c.first_name,
        c.last_name,
        c.middle_name,
        c.full_name as customer_name,
        c.address,
        c.address as customer_address_line,
        c.sitio as customer_sitio,
        c.purok as customer_purok,
        c.brgy as customer_brgy,
        c.city as customer_city,
        c.province as customer_province,
        c.zip_code as customer_zip_code,
        c.contact,
        c.secondary_contact,
        c.birth_date,
        c.gender,
        c.occupation,
        c.business_type,
        c.business_name,
        c.loan_purpose,
        c.email,
        c.fb_account,
        c.messenger_account,
        c.id_type,
        c.id_number,
        c.nationality,
        c.collateral,
        b.branch_name,
        co.first_name || ' ' || co.last_name as collector_name,
        NULLIF(TRIM(COALESCE(co.index_card_name, '')), '') as collector_index_card_name
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblBranch b ON l.branch_id = b.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
    `;

    const loans = selectedLoanId
      ? await dbAll(`${baseSelect} WHERE l.id = ?`, [selectedLoanId])
      : await dbAll(`
          ${baseSelect}
          WHERE c.customer_code LIKE ?
             OR c.full_name LIKE ?
             OR c.first_name LIKE ?
             OR c.last_name LIKE ?
          ORDER BY
            CASE WHEN LOWER(l.loan_type) LIKE '%re%loan%' THEN 0 ELSE 1 END,
            DATE(l.date_released) DESC,
            l.id DESC
          LIMIT 12
        `, [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]);

    if (loans.length === 0) {
      return res.status(404).json({ error: 'No client or loan found for disclosure statement' });
    }

    const loan = loans[0];
    await resolvePrintablePreviousBalance(loan);
    const clientAddress = buildClientAddress(loan);
    loan.address = clientAddress || loan.address;
    loan.customer_address = loan.address;
    loan.full_address = loan.address;
    const schedule = await dbAll(`
      SELECT period_number, due_date, amount_due, amount_paid, status
      FROM tblAmortizationSchedule
      WHERE loan_id = ?
      ORDER BY period_number ASC
    `, [loan.id]);

    res.json({
      loan,
      schedule,
      loan_options: loans.map(item => ({
        id: item.id,
        loan_code: item.loan_code,
        loan_type: item.loan_type,
        date_released: item.date_released,
        principal: item.principal,
        total_amortization: item.total_amortization,
        status: item.status,
      })),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/special-accounts', authenticateToken, async (req, res) => {
  try {
    const dateFrom = req.query.date_from ? toDateKey(req.query.date_from) : '';
    const dateTo = req.query.date_to ? toDateKey(req.query.date_to) : toLocalDateString();
    if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      return res.status(400).json({ error: 'Invalid Date From. Use YYYY-MM-DD format.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return res.status(400).json({ error: 'Invalid Date To. Use YYYY-MM-DD format.' });
    }
    if (dateFrom && dateFrom > dateTo) {
      return res.status(400).json({ error: 'Date From cannot be later than Date To.' });
    }

    const normalize = column => `LOWER(REPLACE(REPLACE(REPLACE(COALESCE(${column}, ''), '-', ''), '_', ''), ' ', ''))`;
    const normalizedStatus = normalize('p.status');
    const normalizedType = normalize('p.payment_type');
    const normalizedRemarks = normalize('p.remarks');
    const dateFromFilter = dateFrom ? 'AND date(p.date_paid) >= date(?)' : '';
    const queryParams = dateFrom ? [dateFrom, dateTo] : [dateTo];
    const accounts = await dbAll(`
      SELECT
        p.id AS payment_id,
        CASE
          WHEN ${normalizedStatus} = 'deceased'
            OR ${normalizedType} = 'deceased'
            OR ${normalizedRemarks} LIKE '%deceased%'
          THEN 'deceased'
          ELSE 'writeoff'
        END AS classification,
        p.payment_code,
        p.or_number,
        p.date_paid AS settlement_date,
        p.amount_paid,
        p.balance_before,
        p.balance_after,
        p.remarks,
        p.created_at,
        l.id AS loan_id,
        l.loan_code,
        l.loan_type,
        l.principal,
        l.interest_amount,
        l.total_amortization,
        l.date_released,
        l.date_maturity,
        c.id AS customer_id,
        c.customer_code,
        c.full_name AS customer_name,
        c.contact,
        c.address,
        c.death_certificate_image,
        COALESCE(c.collector_id, l.collector_id, p.collector_id) AS collector_id,
        COALESCE(
          NULLIF(TRIM(cco.first_name || ' ' || cco.last_name), ''),
          NULLIF(TRIM(lco.first_name || ' ' || lco.last_name), ''),
          NULLIF(TRIM(pco.first_name || ' ' || pco.last_name), ''),
          'Unassigned'
        ) AS collector_name,
        u.full_name AS encoded_by_name
      FROM tblPayment p
      LEFT JOIN tblLoan l ON p.loan_id = l.id
      LEFT JOIN tblCustomer c ON p.customer_id = c.id
      LEFT JOIN tblCollector pco ON p.collector_id = pco.id
      LEFT JOIN tblCollector lco ON l.collector_id = lco.id
      LEFT JOIN tblCollector cco ON c.collector_id = cco.id
      LEFT JOIN tblUser u ON p.encoded_by = u.id
      WHERE LOWER(COALESCE(p.status, '')) <> 'reversed'
        ${dateFromFilter}
        AND date(p.date_paid) <= date(?)
        AND (
          ${normalizedStatus} IN ('deceased', 'writeoff')
          OR ${normalizedType} IN ('deceased', 'writeoff')
          OR ${normalizedRemarks} LIKE '%deceased%'
          OR ${normalizedRemarks} LIKE '%writeoff%'
        )
      ORDER BY date(p.date_paid) DESC, p.id DESC
    `, queryParams);

    const deceased = accounts.filter(account => account.classification === 'deceased');
    const writtenOff = accounts.filter(account => account.classification === 'writeoff');
    const collectorSheets = await dbAll(`
      SELECT id, collector_code, first_name, last_name
      FROM tblCollector
      WHERE is_active = 1
      ORDER BY collector_code
    `);
    const sumAmount = rows => rows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
    res.json({
      date_from: dateFrom,
      date_to: dateTo,
      deceased,
      written_off: writtenOff,
      collector_sheets: collectorSheets,
      summary: {
        deceased_count: deceased.length,
        deceased_amount: sumAmount(deceased),
        written_off_count: writtenOff.length,
        written_off_amount: sumAmount(writtenOff),
        total_accounts: accounts.length,
        total_amount: sumAmount(accounts),
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/aging-report', authenticateToken, async (req, res) => {
  try {
    const dateFrom = req.query.date_from ? toDateKey(req.query.date_from) : '';
    const dateTo = req.query.date_to ? toDateKey(req.query.date_to) : toLocalDateString();
    if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      return res.status(400).json({ error: 'Invalid Date From. Use YYYY-MM-DD format.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return res.status(400).json({ error: 'Invalid Date To. Use YYYY-MM-DD format.' });
    }
    if (dateFrom && dateFrom > dateTo) {
      return res.status(400).json({ error: 'Date From cannot be later than Date To.' });
    }
    const asOf = dateTo;
    const buckets = [
      { key: '1-30', label: '1-30 Days', min: 1, max: 30 },
      { key: '31-60', label: '31-60 Days', min: 31, max: 60 },
      { key: '61-90', label: '61-90 Days', min: 61, max: 90 },
      { key: '91-120', label: '91-120 Days', min: 91, max: 120 },
      { key: '121+', label: '121+ Days', min: 121, max: Infinity },
    ];

    const makeBucketRow = bucket => ({
      bucket_key: bucket.key,
      bucket_label: bucket.label,
      total_clients: 0,
      total_principal: 0,
      total_interest: 0,
      total_loan_amount: 0,
      total_collectibles: 0,
    });

    const maturityDateFilter = dateFrom ? 'AND date(l.date_maturity) >= date(?)' : '';
    const agingLoans = await dbAll(`
      SELECT
        l.id,
        l.customer_id,
        l.collector_id,
        l.loan_code,
        l.loan_type,
        l.principal,
        l.interest_amount,
        COALESCE(l.principal, 0) + COALESCE(l.interest_amount, 0) as total_loan_amount,
        l.amortization,
        l.balance,
        l.date_released,
        l.date_maturity,
        l.status,
        c.customer_code,
        COALESCE(NULLIF(TRIM(c.full_name), ''), NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''), '-') as customer_name,
        c.contact,
        c.address,
        COALESCE(NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''), 'Unassigned') as collector_name,
        CAST(julianday(date(?)) - julianday(date(l.date_maturity)) AS INTEGER) as aging_days
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE COALESCE(l.balance, 0) > 0
        AND l.date_maturity IS NOT NULL
        ${maturityDateFilter}
        AND date(l.date_maturity) < date(?)
        AND LOWER(REPLACE(COALESCE(l.status, ''), '_', ' ')) IN ('active', 'pastdue', 'past due', 'recon', 'reconstruct')
      ORDER BY co.first_name, co.last_name, l.date_maturity ASC
    `, dateFrom ? [asOf, dateFrom, asOf] : [asOf, asOf]);

    const overallMap = Object.fromEntries(buckets.map(bucket => [bucket.key, {
      ...makeBucketRow(bucket),
      client_ids: new Set(),
    }]));
    const collectorMaps = {};

    agingLoans.forEach(loan => {
      const days = Number(loan.aging_days || 0);
      const bucket = buckets.find(item => days >= item.min && days <= item.max);
      if (!bucket) return;

      const collector = loan.collector_name || 'Unassigned';
      const collectorKey = loan.collector_id ? String(loan.collector_id) : 'unassigned';
      if (!collectorMaps[collectorKey]) {
        collectorMaps[collectorKey] = Object.fromEntries(buckets.map(item => [item.key, {
          collector,
          collector_id: loan.collector_id || null,
          ...makeBucketRow(item),
          client_ids: new Set(),
        }]));
      }

      const rows = [overallMap[bucket.key], collectorMaps[collectorKey][bucket.key]];
      rows.forEach(row => {
        if (loan.customer_id) row.client_ids.add(loan.customer_id);
        row.total_principal += Number(loan.principal || 0);
        row.total_interest += Number(loan.interest_amount || 0);
        row.total_loan_amount += Number(loan.total_loan_amount || 0);
        row.total_collectibles += Number(loan.balance || 0);
      });
    });

    const finalizeRow = row => {
      const { client_ids, ...rest } = row;
      return {
        ...rest,
        total_clients: client_ids.size,
      };
    };

    const overall = buckets.map(bucket => finalizeRow(overallMap[bucket.key]));
    const byCollector = Object.keys(collectorMaps)
      .map(collectorKey => ({
        collector: collectorMaps[collectorKey][buckets[0].key].collector,
        collector_id: collectorMaps[collectorKey][buckets[0].key].collector_id,
        buckets: buckets.map(bucket => finalizeRow(collectorMaps[collectorKey][bucket.key])),
      }))
      .sort((a, b) => a.collector.localeCompare(b.collector));

    res.json({
      as_of: asOf,
      date_from: dateFrom,
      date_to: dateTo,
      buckets: overall,
      collectors: byCollector,
      loans: agingLoans,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.__private = {
  normalizeLoanTypeKey,
  resolvePrintablePreviousBalance,
  buildCollectionReleaseChargeRows,
  getCollectionReleaseCharges,
  normalizeCollectorReportName,
};

module.exports = router;
