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
  'Settled(Recon)',
  'Settled(Reloan)',
  'Settled(Fully Paid)',
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

const demandTypeLabel = value => {
  const demandType = normalizeDemandType(value);
  if (demandType === 'first') return '1st Demand';
  if (demandType === 'second') return '2nd Demand';
  if (demandType === 'third') return '3rd Demand';
  return 'Demand Letter';
};

const parseLocalDate = value => {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const parts = text.split('-').map(Number);
  if (parts.length === 3 && parts.every(Boolean)) return new Date(parts[0], parts[1] - 1, parts[2]);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addMonths = (date, months) => {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== day) result.setDate(0);
  return result;
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const isGoodPayment = payment => {
  const status = String(payment.status || payment.payment_status || 'active').toLowerCase();
  return !['cancelled', 'canceled', 'void', 'reversed', 'bad', 'bounced', 'penalty'].includes(status);
};

const getSettledDemandStatus = async loan => {
  if (!loan) return '';

  const loanStatus = String(loan.status || '').trim().toLowerCase();
  const isSettledLoan = ['fullpaid', 'fully paid', 'fully_paid', 'paid', 'closed', 'settled'].includes(loanStatus)
    || Number(loan.balance || 0) <= 0;
  if (!isSettledLoan) return '';

  const loanType = String(loan.loan_type || '').toLowerCase().replace(/[-\s]/g, '');
  if (loanType === 'recon') return 'Settled(Recon)';
  if (loanType === 'reloan') return 'Settled(Reloan)';

  const settlementPayment = await dbGet(`
    SELECT remarks
    FROM tblPayment
    WHERE loan_id = ?
      AND LOWER(COALESCE(status, '')) = 'active'
      AND COALESCE(balance_after, 0) <= 0
    ORDER BY date_paid DESC, id DESC
    LIMIT 1
  `, [loan.id]);

  const settlementRemarks = String(settlementPayment?.remarks || '').toLowerCase();
  if (settlementRemarks.includes('recon')) return 'Settled(Recon)';
  if (settlementRemarks.includes('re-loan') || settlementRemarks.includes('reloan')) return 'Settled(Reloan)';

  const followUpLoan = await dbGet(`
    SELECT loan_type
    FROM tblLoan
    WHERE customer_id = ?
      AND id != ?
      AND COALESCE(previous_balance, 0) > 0
      AND date(COALESCE(date_released, created_at)) >= date(COALESCE(?, '1900-01-01'))
    ORDER BY date(COALESCE(date_released, created_at)) DESC, id DESC
    LIMIT 1
  `, [loan.customer_id, loan.id, loan.date_released || loan.created_at || '']);

  const followUpType = String(followUpLoan?.loan_type || '').toLowerCase().replace(/[-\s]/g, '');
  if (followUpType === 'recon') return 'Settled(Recon)';
  if (followUpType === 'reloan') return 'Settled(Reloan)';

  return 'Settled(Fully Paid)';
};

const computeDemandAmounts = (loan, payments = []) => {
  if (!loan) return {
    total_loan: 0,
    running_balance: 0,
    beginning_overdue: 0,
    penalty_charges: 0,
    total_amount_due: 0
  };

  const dueDate = parseLocalDate(loan.date_maturity);
  const datePrepared = new Date();
  const principal = Number(loan.principal || 0);
  const interestAmount = Number(loan.interest_amount || 0);
  const totalLoan = principal + interestAmount;
  const registeredOutstanding = Number(loan.total_amortization || 0) || totalLoan || Number(loan.balance || 0);
  const hasRunningBalance = loan.balance !== undefined && loan.balance !== null && String(loan.balance).trim() !== '';
  const runningBalance = hasRunningBalance ? Number(loan.balance || 0) : null;
  const loanPayments = payments
    .filter(isGoodPayment)
    .map(payment => ({
      paidDate: parseLocalDate(payment.date_paid),
      amount: Number(payment.amount_paid || 0)
    }))
    .filter(payment => payment.paidDate)
    .sort((a, b) => a.paidDate - b.paidDate);

  if (!dueDate) {
    return {
      total_loan: totalLoan,
      running_balance: runningBalance ?? registeredOutstanding,
      beginning_overdue: registeredOutstanding,
      penalty_charges: 0,
      total_amount_due: runningBalance ?? registeredOutstanding
    };
  }

  const paymentsBeforeDue = loanPayments
    .filter(payment => payment.paidDate <= dueDate)
    .reduce((sum, payment) => sum + payment.amount, 0);
  let beginningBalance = Math.max(0, registeredOutstanding - paymentsBeforeDue);
  const beginningOverdue = beginningBalance;
  const monthlyPeriods = [];
  let totalPenalty = 0;

  if (beginningBalance > 0 && datePrepared > dueDate) {
    let periodStart = new Date(dueDate);
    while (periodStart < datePrepared) {
      const nextBoundary = addMonths(periodStart, 1);
      const periodEnd = nextBoundary < datePrepared ? addDays(nextBoundary, -1) : new Date(datePrepared);
      const paymentMade = loanPayments
        .filter(payment => payment.paidDate > periodStart && payment.paidDate <= periodEnd)
        .reduce((sum, payment) => sum + payment.amount, 0);
      monthlyPeriods.push({ paymentMade });
      periodStart = nextBoundary;
    }

    let groupStartIndex = 0;
    for (let index = 0; index < monthlyPeriods.length; index += 1) {
      const period = monthlyPeriods[index];
      const isFirstMonth = index === 0;
      const hasPayment = period.paymentMade > 0;
      const isLastMonth = index === monthlyPeriods.length - 1;
      if (!isFirstMonth && !hasPayment && !isLastMonth) continue;

      const groupPeriods = monthlyPeriods.slice(groupStartIndex, index + 1);
      const paymentMade = groupPeriods.reduce((sum, item) => sum + item.paymentMade, 0);
      const penaltyBase = Math.max(0, beginningBalance - paymentMade);
      const monthlyPenalty = penaltyBase * 0.05;
      totalPenalty += monthlyPenalty * groupPeriods.length;
      beginningBalance = penaltyBase;
      groupStartIndex = index + 1;
      if (beginningBalance <= 0) break;
    }
  }

  return {
    total_loan: totalLoan,
    running_balance: runningBalance ?? beginningBalance,
    beginning_overdue: beginningOverdue,
    penalty_charges: totalPenalty,
    total_amount_due: (runningBalance ?? beginningBalance) + totalPenalty
  };
};

const enrichDemandRows = async rows => Promise.all(rows.map(async row => {
  let loan = null;
  if (row.loan_id) loan = await dbGet(`SELECT * FROM tblLoan WHERE id = ?`, [row.loan_id]);
  if (!loan && row.loan_code) loan = await dbGet(`SELECT * FROM tblLoan WHERE loan_code = ?`, [row.loan_code]);
  if (!loan && row.customer_id) {
    loan = await dbGet(`
      SELECT *
      FROM tblLoan
      WHERE customer_id = ?
      ORDER BY CASE WHEN LOWER(status) IN ('active', 'pastdue', 'overdue') THEN 0 ELSE 1 END,
               datetime(COALESCE(created_at, date_released)) DESC,
               id DESC
      LIMIT 1
    `, [row.customer_id]);
  }

  const settledStatus = await getSettledDemandStatus(loan);
  if (settledStatus && row.status !== settledStatus) {
    await dbRun(
      `UPDATE tblDemandLetter SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      [settledStatus, row.id]
    );
    row = { ...row, status: settledStatus };
  }

  row = { ...row, loan_code: row.loan_code || loan?.loan_code || '' };

  const hasStoredAmounts = ['total_loan', 'running_balance', 'beginning_overdue', 'penalty_charges', 'total_amount_due']
    .some(key => Number(row[key] || 0) !== 0);
  if (hasStoredAmounts) return row;

  const payments = loan ? await dbAll(`SELECT * FROM tblPayment WHERE loan_id = ?`, [loan.id]) : [];
  return { ...row, ...computeDemandAmounts(loan, payments) };
}));

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

    res.json(await enrichDemandRows(rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const today = todayDateOnly();
    const rows = await dbAll(`
      SELECT *
      FROM tblDemandLetter
      WHERE follow_up_date != ''
        AND follow_up_date <= ?
        AND COALESCE(status, '') NOT IN ('Closed', 'Received', 'Settled(Recon)', 'Settled(Reloan)', 'Settled(Fully Paid)')
      ORDER BY follow_up_date ASC, id DESC
    `, [today]);

    const enrichedRows = await enrichDemandRows(rows);
    const activeRows = enrichedRows.filter(row => !String(row.status || '').toLowerCase().startsWith('settled('));
    const todayCount = activeRows.filter(row => String(row.follow_up_date || '').slice(0, 10) === today).length;
    res.json({ count: activeRows.length, today_count: todayCount, notifications: activeRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/previous-received', authenticateToken, async (req, res) => {
  try {
    const previousType = normalizeDemandType(req.query.type || 'first');
    if (!DEMAND_TYPES.has(previousType)) return res.status(400).json({ error: 'Invalid demand type' });

    const customerId = req.query.customer_id || null;
    const loanId = req.query.loan_id || null;
    const loanCode = String(req.query.loan_code || '').trim();
    const checks = [];
    const params = [previousType];

    if (loanId) {
      checks.push('loan_id = ?');
      params.push(loanId);
    }
    if (customerId) {
      checks.push('customer_id = ?');
      params.push(customerId);
    }
    if (loanCode) {
      checks.push('loan_code = ?');
      params.push(loanCode);
    }

    if (!checks.length) return res.json(null);

    const row = await dbGet(`
      SELECT id, demand_type, client_name, loan_code, date_generated, date_received, status
      FROM tblDemandLetter
      WHERE demand_type = ?
        AND (${checks.join(' OR ')})
      ORDER BY CASE WHEN COALESCE(date_received, '') = '' THEN 1 ELSE 0 END,
               date_received DESC,
               date_generated DESC,
               id DESC
      LIMIT 1
    `, params);

    res.json(row || null);
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

    const customerId = req.body.customer_id || null;
    const loanId = req.body.loan_id || null;
    const loanCode = String(req.body.loan_code || '').trim();
    const duplicateChecks = [];
    const duplicateParams = [];
    if (loanId) {
      duplicateChecks.push('loan_id = ?');
      duplicateParams.push(loanId);
    }
    if (customerId) {
      duplicateChecks.push('customer_id = ?');
      duplicateParams.push(customerId);
    }
    if (loanCode) {
      duplicateChecks.push('loan_code = ?');
      duplicateParams.push(loanCode);
    }
    if (!duplicateChecks.length) {
      duplicateChecks.push('LOWER(client_name) = LOWER(?)');
      duplicateParams.push(clientName);
    }

    const ongoingDemand = await dbGet(`
      SELECT id, demand_type, client_name, loan_code, status
      FROM tblDemandLetter
      WHERE demand_type = ?
        AND (${duplicateChecks.join(' OR ')})
        AND LOWER(COALESCE(status, '')) NOT IN ('closed', 'settled(recon)', 'settled(reloan)', 'settled(fully paid)')
      ORDER BY date_generated DESC, id DESC
      LIMIT 1
    `, [demandType, ...duplicateParams]);

    if (ongoingDemand) {
      const ongoingLabel = demandTypeLabel(ongoingDemand.demand_type);
      return res.status(409).json({
        error: `${ongoingLabel} is on going`,
        is_ongoing_demand: true,
        ongoing_demand: ongoingDemand,
      });
    }

    const generatedDate = req.body.date_generated || todayDateOnly();
    const result = await dbRun(`
      INSERT INTO tblDemandLetter (
        demand_type, customer_id, loan_id, loan_code, courier, collector_name,
        client_name, date_generated, total_loan, running_balance, beginning_overdue,
        penalty_charges, total_amount_due, date_received, follow_up_date, remarks, status, generated_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      demandType,
      customerId,
      loanId,
      loanCode,
      req.body.courier || '',
      req.body.collector_name || '',
      clientName,
      generatedDate,
      Number(req.body.total_loan || 0),
      Number(req.body.running_balance || 0),
      Number(req.body.beginning_overdue || 0),
      Number(req.body.penalty_charges || 0),
      Number(req.body.total_amount_due || 0),
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
    const enrichedRows = await enrichDemandRows([row]);
    res.status(201).json(enrichedRows[0]);
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

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const existing = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Demand letter record not found' });

    await dbRun(`DELETE FROM tblDemandLetter WHERE id = ?`, [req.params.id]);

    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
      [req.user.id, req.user.username, 'DELETE', 'DEMAND_LETTER', req.params.id, `${existing.demand_type} demand deleted for ${existing.client_name}`]
    );

    res.json({ message: 'Demand letter record deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
