const { dbAll } = require('../server/src/db/database');

async function inspectCodilla() {
  const loans = await dbAll(`
    SELECT l.*, c.customer_code, c.full_name
    FROM tblLoan l
    JOIN tblCustomer c ON l.customer_id = c.id
    WHERE c.customer_code = '2464' OR c.full_name LIKE '%CODILLA%'
    ORDER BY l.id DESC
  `);
  console.log('Codilla loans in DB:');
  loans.forEach(l => {
    console.log(`Loan ID: ${l.id} | Code: ${l.loan_code} | Date Released: ${l.date_released} | Period: ${l.loan_period} | Maturity DB: ${l.date_maturity} | Status: ${l.status}`);
  });

  const schedules = await dbAll(`
    SELECT * FROM tblAmortizationSchedule
    WHERE loan_id = ?
    ORDER BY period_number ASC
  `, [loans[0]?.id]);
  console.log(`\nAmortization Schedule count: ${schedules.length}`);
  if (schedules.length > 0) {
    console.log('First schedule item:', schedules[0]);
    console.log('Last schedule item:', schedules[schedules.length - 1]);
  }
}

inspectCodilla().catch(console.error);
