const { dbAll, dbGet } = require('./src/db/database');

async function checkTorreta17() {
  const collector = await dbGet(`SELECT id, first_name, last_name FROM tblCollector WHERE last_name LIKE '%Torreta%' COLLATE NOCASE`);
  if (!collector) return;

  const date = '2026-07-17';
  console.log(`Checking Torreta collections for ${date}...`);

  const payments = await dbAll(`
    SELECT l.id, p.amount_paid, p.payment_type 
    FROM tblPayment p
    JOIN tblLoan l ON p.loan_id = l.id
    WHERE l.collector_id = ? AND p.date_paid = ? AND p.status IN ('active', 'penalty')
  `, [collector.id, date]);
  
  const paymentTotal = payments.reduce((acc, p) => acc + p.amount_paid, 0);
  console.log(`Payments total: ${paymentTotal}`);

  const loans = await dbAll(`
    SELECT id, loan_code, previous_balance, penalty, passbook
    FROM tblLoan
    WHERE collector_id = ? AND date_released = ?
  `, [collector.id, date]);
  
  let pbalTotal = 0;
  let penTotal = 0;
  let passTotal = 0;

  console.log(`Loans on ${date}:`);
  loans.forEach(l => {
    console.log(` - ${l.loan_code} | PrevBal: ${l.previous_balance} | Penalty: ${l.penalty} | Passbook: ${l.passbook}`);
    pbalTotal += Number(l.previous_balance || 0);
    penTotal += Number(l.penalty || 0);
    passTotal += Number(l.passbook || 0);
  });
  
  console.log(`Total PrevBal: ${pbalTotal}`);
  console.log(`Total Penalty: ${penTotal}`);
  console.log(`Total Passbook: ${passTotal}`);

  console.log(`DCR Total for Torreta would be: ${paymentTotal + pbalTotal + penTotal + passTotal}`);
}

checkTorreta17().catch(console.error);
