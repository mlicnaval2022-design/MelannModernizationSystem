const { dbAll, dbGet } = require('./src/db/database');

async function testTorreta() {
  const collector = await dbGet(`SELECT id, first_name, last_name FROM tblCollector WHERE last_name LIKE '%Torreta%' COLLATE NOCASE`);
  if (!collector) return console.log('Torreta not found.');
  
  // Find recent dates
  const payments = await dbAll(`
    SELECT p.date_paid, SUM(p.amount_paid) as total
    FROM tblPayment p
    JOIN tblLoan l ON p.loan_id = l.id
    WHERE l.collector_id = ? AND p.status IN ('active', 'penalty')
    GROUP BY p.date_paid
    ORDER BY p.date_paid DESC
    LIMIT 3
  `, [collector.id]);
  
  console.log(`Torreta's recent collection totals (Payment Table):`);
  console.log(payments);
  
  // Check passbooks
  const passbooks = await dbAll(`
    SELECT date_released, SUM(passbook) as total
    FROM tblLoan
    WHERE collector_id = ? AND passbook > 0
    GROUP BY date_released
    ORDER BY date_released DESC
    LIMIT 3
  `, [collector.id]);
  console.log(`\nTorreta's recent passbook fees (Loan Table):`);
  console.log(passbooks);
  
  // How does DCR compute it? Let's check `dcr.js` or compute it here.
  // In `dcr.js`, usually:
  // "total_collections = sum(payment.amount_paid) + sum(loan.passbook) + sum(loan.penalty)?"
}

testTorreta().catch(console.error);
