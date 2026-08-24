const { dbAll } = require('../server/src/db/database');

function getWorkingDays(period) {
  const p = parseInt(period) || 45;
  if (p === 26 || p === 30) return 26;
  if (p === 39 || p === 45) return 39;
  if (p === 52 || p === 60) return 52;
  if (p === 78 || p === 90) return 78;
  if (p === 104 || p === 120) return 104;
  if (p === 156 || p === 180) return 156;
  if (p % 6 === 0) return p;
  const fullWeeks = Math.floor(p / 7);
  const remainder = p % 7;
  return (fullWeeks * 6) + Math.min(remainder, 6);
}

function computeMaturityDate(dateReleased, loanPeriod) {
  if (!dateReleased) return '';
  const workingDays = getWorkingDays(loanPeriod);
  let date = new Date(`${String(dateReleased).slice(0, 10)}T00:00:00`);
  let added = 0;
  while (added < workingDays) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0) added++;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function findMaturityMismatches() {
  const loans = await dbAll(`
    SELECT l.id, l.loan_code, l.loan_period, l.date_released, l.date_maturity, l.principal, l.total_amortization, l.amortization, l.status,
           c.customer_code, c.full_name
    FROM tblLoan l
    JOIN tblCustomer c ON l.customer_id = c.id
    WHERE l.loan_period IN (26, 30, 39, 45, 52, 60, 78, 90)
    ORDER BY l.id DESC
  `);
  console.log(`Checking ${loans.length} loans for maturity date and amortization discrepancies...`);
  
  let mismatchCount = 0;
  loans.forEach(l => {
    const expectedMaturity = computeMaturityDate(l.date_released, l.loan_period);
    const expectedWorkingDays = getWorkingDays(l.loan_period);
    const expectedAmort = Math.ceil(l.total_amortization / expectedWorkingDays);
    if (l.date_maturity !== expectedMaturity || (l.loan_period === 26 && l.amortization !== expectedAmort)) {
      mismatchCount++;
      if (mismatchCount <= 25) {
        console.log(`Loan ${l.id} (${l.loan_code}) | Cust: ${l.customer_code} ${l.full_name} | Period: ${l.loan_period} | Rel: ${l.date_released} | DB Mat: ${l.date_maturity} -> Expected: ${expectedMaturity} | DB Amort: ${l.amortization} -> Expected: ${expectedAmort}`);
      }
    }
  });
  console.log(`Total mismatches found: ${mismatchCount}`);
}

findMaturityMismatches().catch(console.error);
