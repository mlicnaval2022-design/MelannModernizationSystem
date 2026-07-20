const { dbAll, dbGet } = require('./src/db/database');

async function checkTorretaDCRvsReport() {
  const collector = await dbGet(`SELECT id, first_name, last_name FROM tblCollector WHERE last_name LIKE '%Torreta%' COLLATE NOCASE`);
  if (!collector) return;

  const date = '2026-07-17'; // Based on previous findings
  
  // 1. Report module collection (tblPayment only)
  const payments = await dbAll(`
    SELECT SUM(p.amount_paid) as total 
    FROM tblPayment p
    JOIN tblLoan l ON p.loan_id = l.id
    WHERE l.collector_id = ? AND p.date_paid = ? AND p.status IN ('active', 'penalty')
  `, [collector.id, date]);
  
  const paymentTotal = payments[0].total || 0;
  
  // 2. DCR module collections (includes passbooks and penalties from Loan releases)
  const loans = await dbAll(`
    SELECT loan_code, previous_balance, penalty, passbook
    FROM tblLoan
    WHERE collector_id = ? AND date_released = ?
  `, [collector.id, date]);
  
  let pbalTotal = 0;
  let penTotal = 0;
  let passTotal = 0;

  loans.forEach(l => {
    pbalTotal += Number(l.previous_balance || 0);
    penTotal += Number(l.penalty || 0);
    passTotal += Number(l.passbook || 0);
  });
  
  console.log('--- REPORT MODULE ---');
  console.log(`Payment Table Total (Amortizations): ${paymentTotal}`);
  
  console.log('\n--- DCR MODULE ---');
  console.log(`Payment Table Total: ${paymentTotal}`);
  console.log(`+ Previous Balance Payments (from new loans): ${pbalTotal}`);
  console.log(`+ Penalty Payments (from new loans): ${penTotal}`);
  console.log(`+ Passbook Fees (from new loans): ${passTotal}`);
  console.log(`======================`);
  console.log(`DCR Total for Torreta: ${paymentTotal + pbalTotal + penTotal + passTotal}`);
}

checkTorretaDCRvsReport().catch(console.error);
