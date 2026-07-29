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
      running_balance: Number(loan.balance || 0),
      beginning_overdue: registeredOutstanding,
      penalty_charges: 0,
      total_amount_due: registeredOutstanding
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
    running_balance: Number(loan.balance || 0),
    beginning_overdue: beginningOverdue,
    penalty_charges: totalPenalty,
    total_amount_due: beginningBalance + totalPenalty
  };
};

const enrichDemandRows = async rows => Promise.all(rows.map(async row => {
  const hasStoredAmounts = ['total_loan', 'running_balance', 'beginning_overdue', 'penalty_charges', 'total_amount_due']
    .some(key => Number(row[key] || 0) !== 0);
  if (hasStoredAmounts) return row;

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
        AND COALESCE(status, '') NOT IN ('Closed', 'Received')
      ORDER BY follow_up_date ASC, id DESC
    `, [today]);

    const todayCount = rows.filter(row => String(row.follow_up_date || '').slice(0, 10) === today).length;
    res.json({ count: rows.length, today_count: todayCount, notifications: await enrichDemandRows(rows) });
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
        client_name, date_generated, total_loan, running_balance, beginning_overdue,
        penalty_charges, total_amount_due, date_received, follow_up_date, remarks, status, generated_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      demandType,
      req.body.customer_id || null,
      req.body.loan_id || null,
      req.body.loan_code || '',
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

module.exports = router;
