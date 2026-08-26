const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { applyDemandPenaltyPolicy } = require('../services/demandPenaltyPolicy');

const router = express.Router();

const DEMAND_TYPES = new Set(['first', 'second', 'third']);
const STATUSES = new Set([
  'Draft',
  'Generated',
  'Sent',
  'Awaiting Receipt',
  'Delivered',
  'Received',
  'Follow-up Due',
  'For Follow-up',
  'Superseded',
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

const previousDemandType = value => {
  const demandType = normalizeDemandType(value);
  if (demandType === 'second') return 'first';
  if (demandType === 'third') return 'second';
  return '';
};

const nextDemandType = value => {
  const demandType = normalizeDemandType(value);
  if (demandType === 'first') return 'second';
  if (demandType === 'second') return 'third';
  return '';
};

const buildIdentityMatch = record => {
  const checks = [];
  const params = [];
  if (record.loan_id) {
    checks.push('loan_id = ?');
    params.push(record.loan_id);
  }
  if (record.customer_id) {
    checks.push('customer_id = ?');
    params.push(record.customer_id);
  }
  if (String(record.loan_code || '').trim()) {
    checks.push('loan_code = ?');
    params.push(String(record.loan_code).trim());
  }
  if (!checks.length) {
    checks.push('LOWER(client_name) = LOWER(?)');
    params.push(String(record.client_name || '').trim());
  }
  return { checks, params };
};

const getFirstDemand = async record => {
  if (!record) return null;

  let current = record;
  const visitedIds = new Set();
  while (current) {
    if (normalizeDemandType(current.demand_type) === 'first') return current;
    if (!current.previous_demand_id || visitedIds.has(current.previous_demand_id)) break;
    visitedIds.add(current.previous_demand_id);
    current = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [current.previous_demand_id]);
  }

  const lookupFields = [
    ['loan_id', record.loan_id],
    ['loan_code', String(record.loan_code || '').trim()],
    ['customer_id', record.customer_id],
    ['client_name', String(record.client_name || '').trim()],
  ];

  for (const [field, value] of lookupFields) {
    if (!value) continue;
    const comparison = field === 'client_name' ? 'LOWER(client_name) = LOWER(?)' : `${field} = ?`;
    const firstDemand = await dbGet(`
      SELECT *
      FROM tblDemandLetter
      WHERE demand_type = 'first' AND ${comparison}
      ORDER BY date_generated DESC, id DESC
      LIMIT 1
    `, [value]);
    if (firstDemand) return firstDemand;
  }

  return null;
};

const getFirstDemandPenalty = async record => {
  const firstDemand = await getFirstDemand(record);
  return firstDemand ? Number(firstDemand.penalty_charges || 0) : null;
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
  let firstDemandPenalty = null;
  if (normalizeDemandType(row.demand_type) !== 'first') {
    firstDemandPenalty = await getFirstDemandPenalty(row);
  }

  const hasStoredAmounts = ['total_loan', 'running_balance', 'beginning_overdue', 'penalty_charges', 'total_amount_due']
    .some(key => Number(row[key] || 0) !== 0);
  if (hasStoredAmounts) {
    if (firstDemandPenalty === null) return row;
    return {
      ...row,
      penalty_charges: firstDemandPenalty,
      total_amount_due: Number(row.running_balance || 0) + firstDemandPenalty,
    };
  }

  const payments = loan ? await dbAll(`SELECT * FROM tblPayment WHERE loan_id = ?`, [loan.id]) : [];
  const computedAmounts = computeDemandAmounts(loan, payments);
  if (firstDemandPenalty === null) return { ...row, ...computedAmounts };
  return {
    ...row,
    ...computedAmounts,
    penalty_charges: firstDemandPenalty,
    total_amount_due: Number(computedAmounts.running_balance || 0) + firstDemandPenalty,
  };
}));

router.get('/', authenticateToken, async (req, res) => {
  try {
    const demandType = normalizeDemandType(req.query.type || 'first');
    if (!DEMAND_TYPES.has(demandType)) return res.status(400).json({ error: 'Invalid demand type' });

    const rows = await dbAll(`
      SELECT dl.*,
        (
          SELECT previous.date_received
          FROM tblDemandLetter previous
          WHERE previous.demand_type = 'first'
            AND COALESCE(previous.date_received, '') != ''
            AND (
              (dl.loan_id IS NOT NULL AND previous.loan_id = dl.loan_id)
              OR (dl.customer_id IS NOT NULL AND previous.customer_id = dl.customer_id)
              OR (COALESCE(dl.loan_code, '') != '' AND previous.loan_code = dl.loan_code)
              OR (
                dl.loan_id IS NULL AND dl.customer_id IS NULL AND COALESCE(dl.loan_code, '') = ''
                AND LOWER(previous.client_name) = LOWER(dl.client_name)
              )
            )
          ORDER BY previous.date_received DESC, previous.date_generated DESC, previous.id DESC
          LIMIT 1
        ) AS first_demand_received_date,
        (
          SELECT previous.date_received
          FROM tblDemandLetter previous
          WHERE previous.demand_type = 'second'
            AND COALESCE(previous.date_received, '') != ''
            AND (
              (dl.loan_id IS NOT NULL AND previous.loan_id = dl.loan_id)
              OR (dl.customer_id IS NOT NULL AND previous.customer_id = dl.customer_id)
              OR (COALESCE(dl.loan_code, '') != '' AND previous.loan_code = dl.loan_code)
              OR (
                dl.loan_id IS NULL AND dl.customer_id IS NULL AND COALESCE(dl.loan_code, '') = ''
                AND LOWER(previous.client_name) = LOWER(dl.client_name)
              )
            )
          ORDER BY previous.date_received DESC, previous.date_generated DESC, previous.id DESC
          LIMIT 1
        ) AS second_demand_received_date
      FROM tblDemandLetter dl
      WHERE dl.demand_type = ?
      ORDER BY dl.date_generated DESC, dl.id DESC
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
      WHERE (
          (follow_up_date != '' AND follow_up_date <= ?)
          OR COALESCE(status, '') IN ('Sent', 'Awaiting Receipt')
        )
        AND COALESCE(status, '') NOT IN (
          'Draft', 'Closed', 'Superseded',
          'Settled(Recon)', 'Settled(Reloan)', 'Settled(Fully Paid)'
        )
      ORDER BY 
        CASE 
          WHEN follow_up_date != '' AND follow_up_date <= ? THEN 0
          ELSE 1
        END,
        follow_up_date ASC,
        id DESC
    `, [today, today]);

    const enrichedRows = await enrichDemandRows(rows);
    const activeRows = enrichedRows.filter(row => !String(row.status || '').toLowerCase().startsWith('settled('));
    
    const dueFollowups = activeRows.filter(row => {
      const followUpDate = String(row.follow_up_date || '').slice(0, 10);
      return Boolean(row.date_received && followUpDate && followUpDate <= today);
    });

    const awaitingReceipt = activeRows.filter(row => {
      const isDue = Boolean(row.date_received && String(row.follow_up_date || '').slice(0, 10) <= today);
      return !isDue;
    });

    const dueTodayCount = dueFollowups.filter(row => String(row.follow_up_date || '').slice(0, 10) === today).length;
    const overdueCount = dueFollowups.filter(row => String(row.follow_up_date || '').slice(0, 10) < today).length;

    res.json({
      count: activeRows.length,
      today_count: dueTodayCount,
      due_count: dueFollowups.length,
      overdue_count: overdueCount,
      awaiting_receipt_count: awaitingReceipt.length,
      notifications: activeRows,
    });
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
      SELECT id, demand_type, customer_id, loan_id, client_name, loan_code,
             date_generated, date_received, status, previous_demand_id, penalty_charges
      FROM tblDemandLetter
      WHERE demand_type = ?
        AND (${checks.join(' OR ')})
      ORDER BY CASE WHEN COALESCE(date_received, '') = '' THEN 1 ELSE 0 END,
               date_received DESC,
               date_generated DESC,
               id DESC
      LIMIT 1
    `, params);

    if (!row) return res.json(null);
    const firstDemandPenalty = await getFirstDemandPenalty(row);
    res.json({
      ...row,
      penalty_charges: firstDemandPenalty === null ? Number(row.penalty_charges || 0) : firstDemandPenalty,
    });
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
    const { checks: duplicateChecks, params: duplicateParams } = buildIdentityMatch({
      loan_id: loanId,
      customer_id: customerId,
      loan_code: loanCode,
      client_name: clientName,
    });

    const ongoingDemand = await dbGet(`
      SELECT id, demand_type, client_name, loan_code, status
      FROM tblDemandLetter
      WHERE demand_type = ?
        AND (${duplicateChecks.join(' OR ')})
        AND LOWER(COALESCE(status, '')) NOT IN ('closed', 'superseded', 'settled(recon)', 'settled(reloan)', 'settled(fully paid)')
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
    const sentDate = req.body.date_sent || '';
    const requestedStatus = String(req.body.status || '').trim();
    const initialStatus = requestedStatus || (sentDate ? 'Awaiting Receipt' : 'Generated');
    if (initialStatus && !STATUSES.has(initialStatus)) return res.status(400).json({ error: 'Invalid status' });

    const priorType = previousDemandType(demandType);
    let priorDemand = null;
    if (priorType) {
      priorDemand = await dbGet(`
        SELECT *
        FROM tblDemandLetter
        WHERE demand_type = ?
          AND (${duplicateChecks.join(' OR ')})
          AND LOWER(COALESCE(status, '')) NOT IN ('closed', 'superseded', 'settled(recon)', 'settled(reloan)', 'settled(fully paid)')
        ORDER BY date_generated DESC, id DESC
        LIMIT 1
      `, [priorType, ...duplicateParams]);
    }

    const requestedRunningBalance = Number(req.body.running_balance || 0);
    const firstDemandPenalty = demandType === 'first'
      ? null
      : await getFirstDemandPenalty({
        demand_type: demandType,
        customer_id: customerId,
        loan_id: loanId,
        loan_code: loanCode,
        client_name: clientName,
        previous_demand_id: priorDemand?.id || req.body.previous_demand_id || null,
      });

    if (demandType === 'second' && firstDemandPenalty === null) {
      return res.status(409).json({
        error: 'No 1st Demand was found for this client and loan. Generate and save the 1st Demand first so its penalty charges can be used for the 2nd Demand.',
        missing_first_demand: true,
      });
    }

    const lockedAmounts = applyDemandPenaltyPolicy({
      demandType,
      runningBalance: requestedRunningBalance,
      penaltyCharges: req.body.penalty_charges,
      totalAmountDue: req.body.total_amount_due,
      firstDemandPenalty,
    });

    const result = await dbRun(`
      INSERT INTO tblDemandLetter (
        demand_type, customer_id, loan_id, loan_code, courier, collector_name,
        client_name, date_generated, date_sent, delivery_status, total_loan, running_balance, beginning_overdue,
        penalty_charges, total_amount_due, date_received, follow_up_date, remarks, status,
        previous_demand_id, generated_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      demandType,
      customerId,
      loanId,
      loanCode,
      req.body.courier || '',
      req.body.collector_name || '',
      clientName,
      generatedDate,
      sentDate,
      req.body.delivery_status || (sentDate ? 'Awaiting Receipt' : ''),
      Number(req.body.total_loan || 0),
      requestedRunningBalance,
      Number(req.body.beginning_overdue || 0),
      lockedAmounts.penalty_charges,
      lockedAmounts.total_amount_due,
      req.body.date_received || '',
      req.body.follow_up_date || '',
      req.body.remarks || '',
      initialStatus,
      priorDemand?.id || req.body.previous_demand_id || null,
      req.user.id
    ]);

    const advancesPriorStage = ['Sent', 'Awaiting Receipt', 'Received', 'Follow-up Due'].includes(initialStatus);
    if (priorDemand && advancesPriorStage) {
      await dbRun(`
        UPDATE tblDemandLetter
        SET status = 'Superseded', superseded_by_id = ?, follow_up_date = '', updated_at = datetime('now')
        WHERE id = ?
      `, [result.lastID, priorDemand.id]);
    }

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

router.post('/:id/advance', authenticateToken, async (req, res) => {
  try {
    const existing = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Demand letter record not found' });

    const targetType = nextDemandType(existing.demand_type);
    if (!targetType) return res.status(400).json({ error: 'No next demand stage is configured' });

    const { checks, params } = buildIdentityMatch(existing);
    const sentDate = req.body.date_sent || todayDateOnly();
    const firstDemandPenalty = await getFirstDemandPenalty(existing);
    const lockedAmounts = applyDemandPenaltyPolicy({
      demandType: targetType,
      runningBalance: existing.running_balance,
      penaltyCharges: existing.penalty_charges,
      totalAmountDue: existing.total_amount_due,
      firstDemandPenalty,
    });
    let nextDemand = await dbGet(`
      SELECT *
      FROM tblDemandLetter
      WHERE demand_type = ?
        AND (${checks.join(' OR ')})
        AND id != ?
        AND LOWER(COALESCE(status, '')) NOT IN ('closed', 'superseded', 'settled(recon)', 'settled(reloan)', 'settled(fully paid)')
      ORDER BY date_generated DESC, id DESC
      LIMIT 1
    `, [targetType, ...params, existing.id]);

    if (nextDemand) {
      await dbRun(`
        UPDATE tblDemandLetter
        SET date_sent = ?, courier = ?, delivery_status = 'Awaiting Receipt',
            status = 'Awaiting Receipt', previous_demand_id = ?,
            penalty_charges = ?, total_amount_due = ?, remarks = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [
        sentDate,
        req.body.courier || nextDemand.courier || existing.courier || '',
        existing.id,
        lockedAmounts.penalty_charges,
        Number(nextDemand.running_balance || 0) + lockedAmounts.penalty_charges,
        String(req.body.remarks || '').trim() ? req.body.remarks : nextDemand.remarks,
        nextDemand.id,
      ]);
    } else {
      const result = await dbRun(`
        INSERT INTO tblDemandLetter (
          demand_type, customer_id, loan_id, loan_code, courier, collector_name,
          client_name, date_generated, date_sent, delivery_status, total_loan,
          running_balance, beginning_overdue, penalty_charges, total_amount_due,
          remarks, status, previous_demand_id, generated_by
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        targetType, existing.customer_id, existing.loan_id, existing.loan_code,
        req.body.courier || existing.courier || '', existing.collector_name,
        existing.client_name, req.body.date_generated || sentDate, sentDate,
        'Awaiting Receipt', existing.total_loan, existing.running_balance,
        existing.beginning_overdue, lockedAmounts.penalty_charges, lockedAmounts.total_amount_due,
        req.body.remarks || '', 'Awaiting Receipt', existing.id, req.user.id,
      ]);
      nextDemand = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [result.lastID]);
    }

    await dbRun(`
      UPDATE tblDemandLetter
      SET status = 'Superseded', superseded_by_id = ?, follow_up_date = '', updated_at = datetime('now')
      WHERE id = ?
    `, [nextDemand.id, existing.id]);

    const updatedNextDemand = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [nextDemand.id]);
    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
      [req.user.id, req.user.username, 'ADVANCE', 'DEMAND_LETTER', existing.id,
        `${demandTypeLabel(existing.demand_type)} advanced to ${demandTypeLabel(targetType)} for ${existing.client_name}`]
    );

    res.json({
      message: `${demandTypeLabel(existing.demand_type)} advanced to ${demandTypeLabel(targetType)}`,
      previous_demand: await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [existing.id]),
      next_demand: updatedNextDemand,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const existing = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Demand letter record not found' });

    const receivedDate = req.body.date_received !== undefined ? req.body.date_received : existing.date_received;
    const followUpDate = req.body.follow_up_date !== undefined ? req.body.follow_up_date : existing.follow_up_date;
    const deliveryStatus = req.body.delivery_status !== undefined ? req.body.delivery_status : existing.delivery_status;
    let nextStatus = req.body.status !== undefined ? String(req.body.status || 'Generated') : existing.status;
    // Receipt confirmation must move the demand out of Awaiting Receipt even if
    // an older client sends the record's previous status back in the update.
    if (receivedDate && deliveryStatus === 'Received' && ['Sent', 'Awaiting Receipt'].includes(nextStatus)) {
      nextStatus = followUpDate && String(followUpDate).slice(0, 10) <= todayDateOnly() ? 'Follow-up Due' : 'Received';
    }
    if (nextStatus && !STATUSES.has(nextStatus)) return res.status(400).json({ error: 'Invalid status' });

    await dbRun(`
      UPDATE tblDemandLetter
      SET courier = ?,
          date_sent = ?,
          delivery_status = ?,
          date_received = ?,
          follow_up_date = ?,
          remarks = ?,
          status = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `, [
      req.body.courier !== undefined ? req.body.courier : existing.courier,
      req.body.date_sent !== undefined ? req.body.date_sent : existing.date_sent,
      deliveryStatus,
      receivedDate,
      followUpDate,
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
