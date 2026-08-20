const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/permissions');
const dayjs = require('dayjs');
const { synchronizePromiseToPayStatuses } = require('../services/promiseToPayStatus');

const router = express.Router();

// Helper to log system audit
async function logAudit(userId, role, action, prevVal, newVal, details, refId) {
  try {
    await dbRun(
      `INSERT INTO tblSystemAudit (user_id, role, action, previous_value, new_value, module, ip_address)
       VALUES (?, ?, ?, ?, ?, 'PromiseToPay', ?)`,
      [userId || null, role || 'system', action, prevVal ? String(prevVal) : null, newVal ? String(newVal) : null, details || null]
    );
  } catch (err) {
    console.error('PTP Audit logging error:', err.message);
  }
}

// Compute dynamic status based on promise_date if unresolved
function getEffectiveStatus(record, todayStr = dayjs().format('YYYY-MM-DD')) {
  const currentStatus = record.status || 'Pending';
  if (['Paid', 'Partially Paid', 'Partial Paid Done', 'Fully Paid', 'Fully Paid(Recon)', 'Fully Paid(Reloan)', 'Broken', 'Cancelled', 'Rescheduled'].includes(currentStatus)) {
    return currentStatus;
  }
  const pDate = record.promise_date ? record.promise_date.slice(0, 10) : '';
  if (!pDate) return currentStatus;
  if (pDate < todayStr) return 'Overdue PTP';
  if (pDate === todayStr) return 'Due Today';
  return 'Pending';
}

// 1. Search Client for "Set Promise-to-Pay"
router.get('/search-client', authenticateToken, async (req, res) => {
  try {
    await synchronizePromiseToPayStatuses();
    const { q, branch_id } = req.query;
    if (!q || !q.trim()) {
      return res.json([]);
    }

    const searchTerm = `%${q.trim()}%`;
    let query = `
      SELECT c.id, c.customer_code, c.first_name, c.last_name, 
             TRIM(c.first_name || ' ' || c.last_name) as full_name,
             c.address, c.contact, c.status as customer_status,
             c.collector_id, c.branch_id,
             b.branch_name,
             co.first_name || ' ' || co.last_name as collector_name
      FROM tblCustomer c
      LEFT JOIN tblBranch b ON c.branch_id = b.id
      LEFT JOIN tblCollector co ON c.collector_id = co.id
      WHERE (
        c.customer_code LIKE ? 
        OR c.first_name LIKE ? 
        OR c.last_name LIKE ?
        OR TRIM(c.first_name || ' ' || c.last_name) LIKE ?
        OR c.contact LIKE ?
      )
    `;
    const params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];

    if (req.user.role === 'teller' || req.user.role === 'manager') {
      if (req.user.branch_id) {
        query += ` AND c.branch_id = ?`;
        params.push(req.user.branch_id);
      }
    } else if (branch_id) {
      query += ` AND c.branch_id = ?`;
      params.push(branch_id);
    }

    query += ` ORDER BY c.customer_code ASC LIMIT 25`;

    const customers = await dbAll(query, params);

    // Fetch active loans & latest PTP summary for each customer
    for (const cust of customers) {
      const activeLoans = await dbAll(`
        SELECT l.id, l.loan_code, l.loan_type, l.principal, l.balance, l.amortization,
               l.date_released, l.date_maturity, l.status, l.collector_id,
               co.first_name || ' ' || co.last_name as loan_collector_name
        FROM tblLoan l
        LEFT JOIN tblCollector co ON l.collector_id = co.id
        WHERE l.customer_id = ? 
          AND LOWER(l.status) IN ('active', 'pastdue', 'recon')
          AND COALESCE(l.balance, 0) > 0
        ORDER BY l.date_released DESC, l.id DESC
      `, [cust.id]);

      cust.loans = activeLoans;
      cust.total_balance = activeLoans.reduce((sum, ln) => sum + Number(ln.balance || 0), 0);

      // If customer has no collector assigned directly, fallback to latest loan collector
      if (!cust.collector_name && activeLoans.length > 0 && activeLoans[0].loan_collector_name) {
        cust.collector_name = activeLoans[0].loan_collector_name;
        cust.collector_id = activeLoans[0].collector_id;
      }

      // Recent PTP count
      const ptpCount = await dbGet(
        `SELECT COUNT(*) as cnt FROM tblPromiseToPay WHERE customer_id = ? AND status IN ('Pending', 'Due Today', 'Overdue PTP', 'Overdue')`,
        [cust.id]
      );
      cust.active_ptp_count = ptpCount?.cnt || 0;
    }

    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Client Details + PTP History
router.get('/client/:id', authenticateToken, async (req, res) => {
  try {
    const customerId = req.params.id;
    await synchronizePromiseToPayStatuses({ customerId });
    const customer = await dbGet(`
      SELECT c.*, 
             TRIM(c.first_name || ' ' || c.last_name) as full_name,
             b.branch_name,
             co.first_name || ' ' || co.last_name as collector_name
      FROM tblCustomer c
      LEFT JOIN tblBranch b ON c.branch_id = b.id
      LEFT JOIN tblCollector co ON c.collector_id = co.id
      WHERE c.id = ?
    `, [customerId]);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const loans = await dbAll(`
      SELECT l.*, co.first_name || ' ' || co.last_name as collector_name
      FROM tblLoan l
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE l.customer_id = ?
      ORDER BY l.date_released DESC, l.id DESC
    `, [customerId]);

    const history = await dbAll(`
      SELECT ptp.*, 
             u.full_name as created_by_name,
             up.full_name as updated_by_name,
             l.loan_code,
             co.first_name || ' ' || co.last_name as collector_name
      FROM tblPromiseToPay ptp
      LEFT JOIN tblUser u ON ptp.user_id = u.id
      LEFT JOIN tblUser up ON ptp.updated_by = up.id
      LEFT JOIN tblLoan l ON ptp.loan_id = l.id
      LEFT JOIN tblCollector co ON ptp.collector_id = co.id
      WHERE ptp.customer_id = ?
      ORDER BY ptp.created_at DESC, ptp.id DESC
    `, [customerId]);

    const todayStr = dayjs().format('YYYY-MM-DD');
    const processedHistory = history.map(item => ({
      ...item,
      effective_status: getEffectiveStatus(item, todayStr)
    }));

    res.json({
      customer,
      loans,
      history: processedHistory
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Create new Promise-to-Pay (Set PTP)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      customer_id,
      loan_id,
      collector_id,
      branch_id,
      promise_date,
      follow_up_date,
      recurring_schedule,
      recurring_days,
      promised_amount,
      payment_method,
      reason,
      remarks
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer is required' });
    }
    const pDate = promise_date ? promise_date.slice(0, 10) : null;
    const followUpDate = follow_up_date ? follow_up_date.slice(0, 10) : null;
    const schedule = recurring_schedule && recurring_schedule !== 'One-time' ? recurring_schedule : 'One-time';
    const recurringDays = Array.isArray(recurring_days) ? recurring_days : [];
    if (!pDate && !followUpDate && schedule === 'One-time') {
      return res.status(400).json({ error: 'Set at least one: Promise-to-Pay Date, Follow-up Date, or a Recurring Schedule.' });
    }
    if (['Monthly', 'Weekly'].includes(schedule) && recurringDays.length === 0) {
      return res.status(400).json({ error: `Select at least one recurring ${schedule === 'Monthly' ? 'day of the month' : 'day of the week'}.` });
    }
    const parsedAmount = (promised_amount === undefined || promised_amount === null || promised_amount === '')
      ? 0
      : Number(promised_amount);

    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: 'Valid Promised Amount (0 or higher) is required' });
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    let initialStatus = 'Pending';
    if (pDate === todayStr) initialStatus = 'Due Today';
    else if (pDate && pDate < todayStr) initialStatus = 'Overdue PTP';

    // Auto-resolve branch & collector if missing
    let resolvedCollectorId = collector_id || null;
    let resolvedBranchId = branch_id || req.user.branch_id || null;
    let resolvedLoanId = loan_id || null;

    if (!resolvedCollectorId || !resolvedBranchId || !resolvedLoanId) {
      const cust = await dbGet(`SELECT collector_id, branch_id FROM tblCustomer WHERE id = ?`, [customer_id]);
      if (cust) {
        if (!resolvedCollectorId) resolvedCollectorId = cust.collector_id || null;
        if (!resolvedBranchId) resolvedBranchId = cust.branch_id || null;
      }
      if (!resolvedLoanId) {
        const activeLoan = await dbGet(
          `SELECT id, collector_id, branch_id FROM tblLoan 
           WHERE customer_id = ? AND LOWER(status) IN ('active', 'pastdue', 'recon') AND balance > 0 
           ORDER BY date_released DESC, id DESC LIMIT 1`,
          [customer_id]
        );
        if (activeLoan) {
          resolvedLoanId = activeLoan.id;
          if (!resolvedCollectorId) resolvedCollectorId = activeLoan.collector_id;
          if (!resolvedBranchId) resolvedBranchId = activeLoan.branch_id;
        }
      }
    }

    const result = await dbRun(`
      INSERT INTO tblPromiseToPay (
        alert_id, customer_id, loan_id, collector_id, branch_id, user_id,
        promise_date, follow_up_date, recurring_schedule, recurring_days,
        promised_amount, payment_method, reason, remarks, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      0,
      customer_id,
      resolvedLoanId,
      resolvedCollectorId,
      resolvedBranchId,
      req.user.id,
      pDate,
      followUpDate,
      schedule,
      recurringDays.length ? JSON.stringify(recurringDays) : null,
      parsedAmount,
      payment_method || 'Field Collection',
      reason || 'Payment Commitment',
      remarks || null,
      initialStatus
    ]);

    await logAudit(
      req.user.id,
      req.user.role,
      'SET_PTP',
      null,
      `PTP: ${pDate || 'No promise date'}; Follow-up: ${followUpDate || 'None'}; Schedule: ${schedule}`,
      `Created PTP for Cust #${customer_id}`,
      result.lastID
    );

    const createdRecord = await dbGet(`
      SELECT ptp.*, 
             c.customer_code, TRIM(c.first_name || ' ' || c.last_name) as customer_name,
             co.first_name || ' ' || co.last_name as collector_name,
             l.loan_code, l.balance as loan_balance
      FROM tblPromiseToPay ptp
      JOIN tblCustomer c ON ptp.customer_id = c.id
      LEFT JOIN tblCollector co ON ptp.collector_id = co.id
      LEFT JOIN tblLoan l ON ptp.loan_id = l.id
      WHERE ptp.id = ?
    `, [result.lastID]);

    res.status(201).json({
      message: 'Promise-to-Pay successfully created',
      data: createdRecord
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. PTP Monitoring (List & Metrics grouped by Collector)
router.get('/monitoring', authenticateToken, async (req, res) => {
  try {
    await synchronizePromiseToPayStatuses();
    const {
      search,
      status,
      collector_id,
      branch_id,
      date_from,
      date_to,
      recurring_schedule
    } = req.query;

    const todayStr = dayjs().format('YYYY-MM-DD');

    let baseQuery = `
      SELECT ptp.*,
             c.customer_code,
             TRIM(c.first_name || ' ' || c.last_name) as customer_name,
             c.contact,
             c.address,
             c.status as customer_status,
             l.loan_code,
             l.loan_type,
             l.amortization,
             l.balance as loan_balance,
             l.date_maturity,
             COALESCE(co.first_name || ' ' || co.last_name, 'Unassigned Collector') as collector_name,
             b.branch_name,
             u.full_name as created_by_name,
             up.full_name as updated_by_name
      FROM tblPromiseToPay ptp
      JOIN tblCustomer c ON ptp.customer_id = c.id
      LEFT JOIN tblLoan l ON ptp.loan_id = l.id
      LEFT JOIN tblCollector co ON ptp.collector_id = co.id
      LEFT JOIN tblBranch b ON ptp.branch_id = b.id
      LEFT JOIN tblUser u ON ptp.user_id = u.id
      LEFT JOIN tblUser up ON ptp.updated_by = up.id
      WHERE 1=1
    `;
    const params = [];

    // Role-based restrictions
    if (req.user.role === 'collector') {
      baseQuery += ` AND ptp.collector_id = ?`;
      params.push(req.user.id);
    } else if (req.user.role === 'teller' || req.user.role === 'manager') {
      if (req.user.branch_id) {
        baseQuery += ` AND (ptp.branch_id = ? OR c.branch_id = ?)`;
        params.push(req.user.branch_id, req.user.branch_id);
      }
    }

    if (collector_id && collector_id !== 'all') {
      if (collector_id === 'unassigned') {
        baseQuery += ` AND (ptp.collector_id IS NULL OR ptp.collector_id = 0)`;
      } else {
        baseQuery += ` AND ptp.collector_id = ?`;
        params.push(collector_id);
      }
    }

    if (branch_id) {
      baseQuery += ` AND ptp.branch_id = ?`;
      params.push(branch_id);
    }

    if (recurring_schedule && recurring_schedule !== 'all') {
      baseQuery += ` AND ptp.recurring_schedule = ?`;
      params.push(recurring_schedule);
    }

    if (date_from) {
      baseQuery += ` AND date(ptp.promise_date) >= date(?)`;
      params.push(date_from);
    }
    if (date_to) {
      baseQuery += ` AND date(ptp.promise_date) <= date(?)`;
      params.push(date_to);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      baseQuery += ` AND (
        c.customer_code LIKE ?
        OR c.first_name LIKE ?
        OR c.last_name LIKE ?
        OR TRIM(c.first_name || ' ' || c.last_name) LIKE ?
        OR c.contact LIKE ?
        OR l.loan_code LIKE ?
        OR ptp.remarks LIKE ?
        OR ptp.reason LIKE ?
      )`;
      params.push(s, s, s, s, s, s, s, s);
    }

    // Status filter
    if (status && status !== 'all') {
      if (status === 'due_today') {
        baseQuery += ` AND ptp.status IN ('Pending', 'Due Today') AND date(ptp.promise_date) = date(?)`;
        params.push(todayStr);
      } else if (status === 'overdue') {
        baseQuery += ` AND ptp.status IN ('Pending', 'Due Today', 'Overdue PTP') AND date(ptp.promise_date) < date(?)`;
        params.push(todayStr);
      } else if (status === 'pending') {
        baseQuery += ` AND ptp.status IN ('Pending', 'Due Today') AND date(ptp.promise_date) >= date(?)`;
        params.push(todayStr);
      } else {
        baseQuery += ` AND LOWER(ptp.status) = LOWER(?)`;
        params.push(status);
      }
    }

    baseQuery += ` ORDER BY ptp.promise_date ASC, ptp.id DESC`;

    const records = await dbAll(baseQuery, params);

    // Compute effective status for all records
    const processedRecords = records.map(r => ({
      ...r,
      effective_status: getEffectiveStatus(r, todayStr)
    }));

    // Calculate Summary Metrics & Collector breakdown across all PTP records
    const allActiveQuery = `
      SELECT ptp.id, ptp.collector_id, ptp.status, ptp.promise_date, ptp.promised_amount, ptp.paid_amount,
             COALESCE(co.first_name || ' ' || co.last_name, 'Unassigned Collector') as collector_name
      FROM tblPromiseToPay ptp
      LEFT JOIN tblCollector co ON ptp.collector_id = co.id
    `;
    const allRecords = await dbAll(allActiveQuery);

    let totalPromised = 0;
    let totalCollected = 0;
    let dueTodayCount = 0;
    let overdueCount = 0;
    let pendingCount = 0;
    let fulfilledCount = 0;
    let brokenCount = 0;

    const collectorStatsMap = new Map();

    // Initialize unassigned
    collectorStatsMap.set('unassigned', {
      collector_id: 'unassigned',
      collector_name: 'Unassigned Collector',
      count: 0,
      total_promised: 0,
      due_today_count: 0,
      overdue_count: 0
    });

    // Also get all active collectors in DB to match Collectors Module
    const allCollectors = await dbAll(`
      SELECT id, collector_code, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) as name 
      FROM tblCollector 
      WHERE is_active = 1 
      ORDER BY CAST(collector_code AS INTEGER) ASC, id ASC
    `);
    allCollectors.forEach(col => {
      collectorStatsMap.set(String(col.id), {
        collector_id: col.id,
        collector_code: col.collector_code,
        collector_name: col.name || `Collector ${col.collector_code}`,
        count: 0,
        total_promised: 0,
        due_today_count: 0,
        overdue_count: 0
      });
    });

    allRecords.forEach(item => {
      const effStatus = getEffectiveStatus(item, todayStr);
      const promisedAmt = Number(item.promised_amount || 0);
      const paidAmt = Number(item.paid_amount || 0);

      totalPromised += promisedAmt;
      totalCollected += paidAmt;

      if (effStatus === 'Due Today') dueTodayCount++;
      else if (effStatus === 'Overdue PTP') overdueCount++;
      else if (effStatus === 'Pending') pendingCount++;
      else if (['Paid', 'Partially Paid', 'Partial Paid Done', 'Fully Paid', 'Fully Paid(Recon)', 'Fully Paid(Reloan)'].includes(effStatus)) fulfilledCount++;
      else if (effStatus === 'Broken') brokenCount++;

      const colKey = item.collector_id ? String(item.collector_id) : 'unassigned';
      if (!collectorStatsMap.has(colKey)) {
        collectorStatsMap.set(colKey, {
          collector_id: item.collector_id || 'unassigned',
          collector_name: item.collector_name || 'Unassigned Collector',
          count: 0,
          total_promised: 0,
          due_today_count: 0,
          overdue_count: 0
        });
      }
      const colEntry = collectorStatsMap.get(colKey);
      colEntry.count += 1;
      colEntry.total_promised += promisedAmt;
      if (effStatus === 'Due Today') colEntry.due_today_count += 1;
      if (effStatus === 'Overdue PTP') colEntry.overdue_count += 1;
    });

    const collectorTabs = Array.from(collectorStatsMap.values())
      .filter(col => col.collector_id !== 'unassigned' || col.count > 0)
      .sort((a, b) => {
        if (a.collector_id === 'unassigned') return 1;
        if (b.collector_id === 'unassigned') return -1;
        const codeA = Number(a.collector_code) || a.collector_id;
        const codeB = Number(b.collector_code) || b.collector_id;
        return codeA - codeB;
      });

    res.json({
      records: processedRecords,
      summary: {
        total_records: allRecords.length,
        total_active_ptp: pendingCount + dueTodayCount + overdueCount,
        total_promised_amount: totalPromised,
        total_collected_amount: totalCollected,
        due_today_count: dueTodayCount,
        overdue_count: overdueCount,
        pending_count: pendingCount,
        fulfilled_count: fulfilledCount,
        broken_count: brokenCount
      },
      collectorTabs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. PTP Due Updates (Specifically for "PTP Update" Tab)
router.get('/due-updates', authenticateToken, async (req, res) => {
  try {
    await synchronizePromiseToPayStatuses();
    const { due_filter, collector_id, branch_id, search } = req.query;
    const todayStr = dayjs().format('YYYY-MM-DD');
    const threeDaysLater = dayjs().add(3, 'day').format('YYYY-MM-DD');

    let q = `
      SELECT ptp.*,
             c.customer_code,
             TRIM(c.first_name || ' ' || c.last_name) as customer_name,
             c.contact,
             c.address,
             l.loan_code,
             l.balance as loan_balance,
             l.amortization,
             COALESCE(co.first_name || ' ' || co.last_name, 'Unassigned') as collector_name,
             b.branch_name,
             u.full_name as created_by_name
      FROM tblPromiseToPay ptp
      JOIN tblCustomer c ON ptp.customer_id = c.id
      LEFT JOIN tblLoan l ON ptp.loan_id = l.id
      LEFT JOIN tblCollector co ON ptp.collector_id = co.id
      LEFT JOIN tblBranch b ON ptp.branch_id = b.id
      LEFT JOIN tblUser u ON ptp.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by due status
    if (due_filter === 'overdue') {
      q += ` AND ptp.status IN ('Pending', 'Due Today', 'Overdue PTP')
        AND (date(ptp.promise_date) < date(?) OR date(ptp.follow_up_date) < date(?))`;
      params.push(todayStr, todayStr);
    } else if (due_filter === 'due_today') {
      q += ` AND ptp.status IN ('Pending', 'Due Today')
        AND (date(ptp.promise_date) = date(?) OR date(ptp.follow_up_date) = date(?))`;
      params.push(todayStr, todayStr);
    } else if (due_filter === 'upcoming_3days') {
      q += ` AND ptp.status IN ('Pending', 'Due Today')
        AND ((date(ptp.promise_date) > date(?) AND date(ptp.promise_date) <= date(?))
          OR (date(ptp.follow_up_date) > date(?) AND date(ptp.follow_up_date) <= date(?)))`;
      params.push(todayStr, threeDaysLater, todayStr, threeDaysLater);
    } else if (due_filter === 'all_records') {
      // no restriction
    } else {
      // Default: 'all_due' (Overdue + Due Today)
      q += ` AND ptp.status IN ('Pending', 'Due Today', 'Overdue PTP')
        AND (date(ptp.promise_date) <= date(?) OR date(ptp.follow_up_date) <= date(?))`;
      params.push(todayStr, todayStr);
    }

    if (collector_id && collector_id !== 'all') {
      if (collector_id === 'unassigned') {
        q += ` AND (ptp.collector_id IS NULL OR ptp.collector_id = 0)`;
      } else {
        q += ` AND ptp.collector_id = ?`;
        params.push(collector_id);
      }
    }

    if (branch_id) {
      q += ` AND ptp.branch_id = ?`;
      params.push(branch_id);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      q += ` AND (
        c.customer_code LIKE ?
        OR c.first_name LIKE ?
        OR c.last_name LIKE ?
        OR TRIM(c.first_name || ' ' || c.last_name) LIKE ?
        OR c.contact LIKE ?
        OR l.loan_code LIKE ?
        OR ptp.remarks LIKE ?
      )`;
      params.push(s, s, s, s, s, s, s);
    }

    q += ` ORDER BY ptp.promise_date ASC, ptp.id DESC`;

    const records = await dbAll(q, params);
    const processed = records.map(r => ({
      ...r,
      effective_status: getEffectiveStatus(r, todayStr),
      days_difference: dayjs(r.follow_up_date || r.promise_date).diff(dayjs(todayStr), 'day')
    }));

    // Also get quick counts for the tabs
    const counts = await dbGet(`
      SELECT 
        SUM(CASE WHEN status IN ('Pending', 'Due Today', 'Overdue PTP') AND (date(promise_date) < date(?) OR date(follow_up_date) < date(?)) THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN status IN ('Pending', 'Due Today') AND (date(promise_date) = date(?) OR date(follow_up_date) = date(?)) THEN 1 ELSE 0 END) as due_today_count,
        SUM(CASE WHEN status IN ('Pending', 'Due Today') AND ((date(promise_date) > date(?) AND date(promise_date) <= date(?)) OR (date(follow_up_date) > date(?) AND date(follow_up_date) <= date(?))) THEN 1 ELSE 0 END) as upcoming_count,
        COUNT(*) as total_count
      FROM tblPromiseToPay
    `, [todayStr, todayStr, todayStr, todayStr, todayStr, threeDaysLater, todayStr, threeDaysLater]);

    res.json({
      records: processed,
      counts: {
        overdue: counts?.overdue_count || 0,
        due_today: counts?.due_today_count || 0,
        upcoming: counts?.upcoming_count || 0,
        all_due: (counts?.overdue_count || 0) + (counts?.due_today_count || 0),
        total: counts?.total_count || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5.1 Quick due notification count for sidebar badge & topbar
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    await synchronizePromiseToPayStatuses();
    const todayStr = dayjs().format('YYYY-MM-DD');
    let query = `
      SELECT 
        SUM(CASE WHEN status IN ('Pending', 'Due Today', 'Overdue PTP') AND (date(promise_date) < date(?) OR date(follow_up_date) < date(?)) THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN status IN ('Pending', 'Due Today', 'Overdue PTP') AND (date(promise_date) = date(?) OR date(follow_up_date) = date(?)) THEN 1 ELSE 0 END) as due_today_count,
        COUNT(*) as total_count
      FROM tblPromiseToPay
      WHERE 1=1
    `;
    const params = [todayStr, todayStr, todayStr, todayStr];

    if (req.user.role === 'collector') {
      query += ` AND collector_id = ?`;
      params.push(req.user.id);
    } else if (req.user.role === 'teller' || req.user.role === 'manager') {
      if (req.user.branch_id) {
        query += ` AND branch_id = ?`;
        params.push(req.user.branch_id);
      }
    }

    const counts = await dbGet(query, params);
    const dueToday = Number(counts?.due_today_count || 0);
    const overdue = Number(counts?.overdue_count || 0);
    const dueCount = dueToday + overdue;

    res.json({
      count: dueCount,
      due_today_count: dueToday,
      overdue_count: overdue,
      total_count: Number(counts?.total_count || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Update PTP Status & Follow-up (Quick Update Modal)
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const ptpId = req.params.id;
    const {
      status, // 'Paid' | 'Partially Paid' | 'Rescheduled' | 'Broken' | 'Cancelled'
      paid_amount,
      payment_date,
      new_promise_date,
      new_follow_up_date,
      remarks,
      recurring_schedule
    } = req.body;

    const existing = await dbGet(`SELECT * FROM tblPromiseToPay WHERE id = ?`, [ptpId]);
    if (!existing) {
      return res.status(404).json({ error: 'Promise-to-Pay record not found' });
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    const updateRemarks = remarks ? String(remarks).trim() : existing.last_update_remarks;

    if (status === 'Rescheduled' && new_promise_date) {
      // Mark current as Rescheduled or update its promise date
      await dbRun(`
        UPDATE tblPromiseToPay 
        SET status = 'Rescheduled',
            last_update_remarks = ?,
            updated_by = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `, [updateRemarks || 'Rescheduled commitment', req.user.id, ptpId]);

      // Create new PTP record with continuation
      const newPDate = new_promise_date.slice(0, 10);
      let initialStatus = 'Pending';
      if (newPDate === todayStr) initialStatus = 'Due Today';
      else if (newPDate < todayStr) initialStatus = 'Overdue PTP';

      const newRec = await dbRun(`
        INSERT INTO tblPromiseToPay (
          alert_id, customer_id, loan_id, collector_id, branch_id, user_id,
          promise_date, follow_up_date, recurring_schedule,
          promised_amount, payment_method, reason, remarks, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [
        0,
        existing.customer_id,
        existing.loan_id,
        existing.collector_id,
        existing.branch_id,
        req.user.id,
        newPDate,
        new_follow_up_date ? new_follow_up_date.slice(0, 10) : null,
        recurring_schedule || existing.recurring_schedule || 'One-time',
        existing.promised_amount,
        existing.payment_method,
        `Rescheduled from PTP #${ptpId}`,
        updateRemarks,
        initialStatus
      ]);

      await logAudit(
        req.user.id,
        req.user.role,
        'RESCHEDULE_PTP',
        existing.status,
        'Rescheduled',
        `PTP #${ptpId} rescheduled to ${newPDate} (New PTP #${newRec.lastID})`,
        ptpId
      );

      return res.json({
        message: 'Promise-to-Pay rescheduled successfully',
        new_ptp_id: newRec.lastID
      });
    }

    // Regular status update (Paid, Partially Paid, Broken, Cancelled, etc.)
    await dbRun(`
      UPDATE tblPromiseToPay
      SET status = ?,
          paid_amount = ?,
          payment_date = ?,
          last_update_remarks = ?,
          updated_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `, [
      status || existing.status,
      paid_amount !== undefined && paid_amount !== null ? Number(paid_amount) : existing.paid_amount,
      payment_date ? payment_date.slice(0, 10) : (status === 'Paid' ? todayStr : existing.payment_date),
      updateRemarks,
      req.user.id,
      ptpId
    ]);

    await logAudit(
      req.user.id,
      req.user.role,
      'UPDATE_PTP_STATUS',
      existing.status,
      status,
      `PTP #${ptpId} updated to ${status}. Remarks: ${updateRemarks || 'None'}`,
      ptpId
    );

    res.json({ message: 'Promise-to-Pay status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6.1 Edit PTP Full Record Details
router.put('/:id', authenticateToken, requireModuleAccess('edit'), async (req, res) => {
  try {
    const ptpId = req.params.id;
    const {
      promise_date,
      follow_up_date,
      recurring_schedule,
      promised_amount,
      payment_method,
      reason,
      collector_id,
      branch_id,
      remarks,
      status
    } = req.body;

    const existing = await dbGet(`SELECT * FROM tblPromiseToPay WHERE id = ?`, [ptpId]);
    if (!existing) {
      return res.status(404).json({ error: 'Promise-to-Pay record not found' });
    }

    const parsedAmount = (promised_amount === undefined || promised_amount === null || promised_amount === '')
      ? 0
      : Number(promised_amount);

    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: 'Valid Promised Amount (0 or higher) is required' });
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    const pDate = promise_date ? promise_date.slice(0, 10) : existing.promise_date;
    let nextStatus = status || existing.status;

    if (['Pending', 'Due Today', 'Overdue'].includes(nextStatus)) {
      if (pDate === todayStr) nextStatus = 'Due Today';
      else if (pDate < todayStr) nextStatus = 'Overdue';
      else nextStatus = 'Pending';
    }

    await dbRun(`
      UPDATE tblPromiseToPay
      SET promise_date = ?,
          follow_up_date = ?,
          recurring_schedule = ?,
          promised_amount = ?,
          payment_method = ?,
          reason = ?,
          collector_id = ?,
          branch_id = ?,
          remarks = ?,
          status = ?,
          updated_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `, [
      pDate,
      follow_up_date ? follow_up_date.slice(0, 10) : null,
      recurring_schedule || existing.recurring_schedule || 'One-time',
      parsedAmount,
      payment_method || existing.payment_method,
      reason || existing.reason,
      collector_id !== undefined ? collector_id : existing.collector_id,
      branch_id !== undefined ? branch_id : existing.branch_id,
      remarks !== undefined ? remarks : existing.remarks,
      nextStatus,
      req.user.id,
      ptpId
    ]);

    await logAudit(
      req.user.id,
      req.user.role,
      'EDIT_PTP',
      existing.promise_date,
      pDate,
      `Edited PTP #${ptpId} for Customer #${existing.customer_id}`,
      ptpId
    );

    const updated = await dbGet(`SELECT * FROM tblPromiseToPay WHERE id = ?`, [ptpId]);
    res.json({ message: 'Promise-to-Pay record updated successfully', data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Delete PTP Record
router.delete('/:id', authenticateToken, requireModuleAccess('crud'), async (req, res) => {
  try {
    const ptpId = req.params.id;
    const existing = await dbGet(`SELECT * FROM tblPromiseToPay WHERE id = ?`, [ptpId]);
    if (!existing) {
      return res.status(404).json({ error: 'Record not found' });
    }

    await dbRun(`DELETE FROM tblPromiseToPay WHERE id = ?`, [ptpId]);
    await logAudit(req.user.id, req.user.role, 'DELETE_PTP', existing.status, 'Deleted', `Deleted PTP #${ptpId}`, ptpId);

    res.json({ message: 'Promise-to-Pay record removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
