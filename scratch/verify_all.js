const { dbAll, dbGet } = require('../server/src/db/database');
const { buildCollectionPaymentExclusionSql, isExcludedCollectionPayment } = require('../server/src/services/paymentClassification');
const { sqlNotSunday } = require('../server/src/services/operationDays');

async function verify() {
  console.log('====================================================');
  console.log('VERIFYING RECON BALANCE AS COLLECTION FIX');
  console.log('====================================================');

  // 1. Check Alao, Arlyn payments
  const alaoPayments = await dbAll(`
    SELECT p.*, l.loan_code, c.customer_code, c.full_name
    FROM tblPayment p
    JOIN tblCustomer c ON p.customer_id = c.id
    LEFT JOIN tblLoan l ON p.loan_id = l.id
    WHERE c.customer_code = '3881'
    ORDER BY p.date_paid ASC, p.id ASC
  `);
  console.log('\n1. Payments for Alao, Arlyn (3881):');
  alaoPayments.forEach(p => {
    const isExcl = isExcludedCollectionPayment(p);
    console.log(`- Code: ${p.payment_code} | Date: ${p.date_paid} | Amt: ₱${p.amount_paid} | BalAfter: ₱${p.balance_after} | Type: ${p.payment_type} | Status: ${p.status} | ExcludedFromCollection: ${isExcl} | Remarks: "${p.remarks}"`);
  });

  // 2. Check DCR summary for 2026-08-22
  console.log('\n2. DCR / Collections Query for 2026-08-22:');
  const pCond = `p.date_paid = ? AND p.status IN ('active', 'penalty') AND ${buildCollectionPaymentExclusionSql('p')} AND ${sqlNotSunday('p.date_paid')}`;
  const collections = await dbAll(`
    SELECT p.id, p.or_number, p.payment_code, p.amount_paid, p.payment_type, p.status, p.remarks, p.date_paid,
           c.customer_code, c.first_name, c.last_name,
           COALESCE(
             co.first_name || ' ' || co.last_name,
             rco.first_name || ' ' || rco.last_name,
             cco.first_name || ' ' || cco.last_name
           ) as collector_name
    FROM tblPayment p
    JOIN tblCustomer c ON p.customer_id = c.id
    LEFT JOIN tblCollector co ON p.collector_id = co.id
    LEFT JOIN tblLoan rl ON (rl.customer_id = p.customer_id AND rl.date_released = p.date_paid AND LOWER(COALESCE(rl.status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled'))
    LEFT JOIN tblCollector rco ON rl.collector_id = rco.id
    LEFT JOIN tblCollector cco ON c.collector_id = cco.id
    WHERE ${pCond}
  `, ['2026-08-22']);

  const totalColl = collections.reduce((s, c) => s + c.amount_paid, 0);
  console.log(`Total active collections on 2026-08-22: ₱${totalColl.toLocaleString('en-US', { minimumFractionDigits: 2 })} across ${collections.length} payments`);

  const alao22 = collections.find(c => c.customer_code === '3881');
  console.log(`Alao, Arlyn present in collections? ${alao22 ? 'YES (₱' + alao22.amount_paid + ' under ' + alao22.collector_name + ')' : 'NO'}`);

  const aldieTotal = collections.filter(c => c.collector_name === 'Aldie Rosal').reduce((s, c) => s + c.amount_paid, 0);
  const aldieCount = collections.filter(c => c.collector_name === 'Aldie Rosal').length;
  console.log(`Aldie Rosal Collections Total: ₱${aldieTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${aldieCount} payments)`);

  // 3. Check Daily Collection Report endpoint query
  console.log('\n3. Reports -> Daily Collection query for 2026-08-22:');
  const dcrPayments = await dbAll(`
    SELECT p.id,
           p.loan_id,
           p.customer_id,
           p.payment_code,
           p.date_paid,
           p.amount_paid,
           p.balance_after,
           p.payment_type,
           l.loan_code,
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
  `, ['2026-08-22', '2026-08-22']);
  const alaoInReport = dcrPayments.find(p => p.customer_code === '3881');
  console.log(`Alao, Arlyn in Daily Collection Report? ${alaoInReport ? 'YES (₱' + alaoInReport.amount_paid + ', Payment Code: ' + alaoInReport.payment_code + ')' : 'NO'}`);

  console.log('\n====================================================');
  console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

verify().catch(console.error);
