const express = require('express');
const dayjs = require('dayjs');
const { dbAll, dbGet } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { sqlNotSunday } = require('../services/operationDays');

const router = express.Router();

const toAmount = value => Number(value || 0);

function resolveDateRange(query) {
  const today = dayjs();
  const defaultTo = today.day() === 0 ? today.subtract(1, 'day') : today;
  const defaultFrom = defaultTo.subtract(6, 'day');

  return {
    from: dayjs(query.date_from || defaultFrom).format('YYYY-MM-DD'),
    to: dayjs(query.date_to || defaultTo).format('YYYY-MM-DD')
  };
}

router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { from, to } = resolveDateRange(req.query);

    const collectors = await dbAll(`
      SELECT
        co.id,
        co.collector_code,
        co.first_name || ' ' || co.last_name as name,
        COALESCE((
          SELECT SUM(target_loans.amortization)
          FROM (
            SELECT DISTINCT l.id, l.amortization
            FROM tblLoan l
            WHERE l.collector_id = co.id
              AND (l.date_released IS NULL OR date(l.date_released) <= date(?))
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
          SELECT SUM(p.amount_paid)
          FROM tblPayment p
          WHERE p.collector_id = co.id
            AND date(p.date_paid) BETWEEN date(?) AND date(?)
            AND p.status IN ('active', 'penalty')
            AND ${sqlNotSunday('p.date_paid')}
        ), 0) as collected,
        COALESCE((
          SELECT COUNT(DISTINCT p.customer_id)
          FROM tblPayment p
          WHERE p.collector_id = co.id
            AND date(p.date_paid) BETWEEN date(?) AND date(?)
            AND p.status IN ('active', 'penalty')
            AND ${sqlNotSunday('p.date_paid')}
        ), 0) as paying_clients,
        COALESCE((
          SELECT COUNT(*)
          FROM tblLoan l
          WHERE l.collector_id = co.id
            AND LOWER(l.status) IN ('active', 'pastdue')
            AND COALESCE(l.balance, 0) > 0
        ), 0) as active_loans
      FROM tblCollector co
      WHERE co.is_active = 1
        AND LOWER(co.first_name || ' ' || co.last_name) NOT LIKE '%pastdue%'
      ORDER BY collected DESC, name ASC
    `, [to, to, from, to, from, to]);

    const trend = await dbAll(`
      SELECT
        p.date_paid as date,
        COALESCE(SUM(p.amount_paid), 0) as collected
      FROM tblPayment p
      WHERE date(p.date_paid) BETWEEN date(?) AND date(?)
        AND p.status IN ('active', 'penalty')
        AND ${sqlNotSunday('p.date_paid')}
      GROUP BY p.date_paid
      ORDER BY p.date_paid ASC
    `, [from, to]);

    const totals = collectors.reduce((acc, row) => {
      acc.target += toAmount(row.target);
      acc.collected += toAmount(row.collected);
      acc.paying_clients += toAmount(row.paying_clients);
      acc.active_loans += toAmount(row.active_loans);
      return acc;
    }, { target: 0, collected: 0, paying_clients: 0, active_loans: 0 });

    const topCollector = collectors[0] || null;
    const paymentCount = await dbGet(`
      SELECT COUNT(*) as count
      FROM tblPayment p
      WHERE date(p.date_paid) BETWEEN date(?) AND date(?)
        AND p.status IN ('active', 'penalty')
        AND ${sqlNotSunday('p.date_paid')}
    `, [from, to]);

    res.json({
      date_from: from,
      date_to: to,
      totals: {
        ...totals,
        payment_count: paymentCount?.count || 0,
        achievement_rate: totals.target > 0 ? Math.round((totals.collected / totals.target) * 100) : 0
      },
      top_collector: topCollector,
      collectors: collectors.map(row => ({
        ...row,
        target: toAmount(row.target),
        collected: toAmount(row.collected),
        paying_clients: toAmount(row.paying_clients),
        active_loans: toAmount(row.active_loans),
        achievement_rate: toAmount(row.target) > 0 ? Math.round((toAmount(row.collected) / toAmount(row.target)) * 100) : 0
      })),
      trend
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
