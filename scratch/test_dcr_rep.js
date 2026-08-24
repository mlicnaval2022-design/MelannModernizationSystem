const { dbAll, dbGet, dbRun } = require('../server/src/db/database');
const { buildCollectionPaymentExclusionSql } = require('../server/src/services/paymentClassification');
const { sqlNotSunday } = require('../server/src/services/operationDays');

async function testDailyCollectionReport() {
  await dbRun('BEGIN TRANSACTION');
  try {
    await dbRun(`
      UPDATE tblPayment
      SET status = 'active', payment_type = 'regular', remarks = 'Auto-posted old balance during loan release'
      WHERE id = 52800
    `);

    const from = '2026-08-22';
    const to = '2026-08-22';
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

    const aldiePayments = payments.filter(p => p.collector_name === 'Aldie Rosal');
    console.log(`Aldie Rosal total payments in Daily Collection: ${aldiePayments.length}`);
    const alaoInAldie = aldiePayments.find(p => p.customer_code === '3881');
    console.log('Alao, Arlyn in Aldie payments:', alaoInAldie);
  } finally {
    await dbRun('ROLLBACK');
  }
}

testDailyCollectionReport().catch(console.error);
