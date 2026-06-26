const { dbAll } = require('./src/db/database');
async function run() {
  const today = new Date().toISOString().split('T')[0];
  const query = `
      SELECT l.id, l.loan_code, l.loan_type, l.principal, l.balance as outstanding_balance, 
             l.date_released, l.date_maturity, l.status,
             c.customer_code as client_code, c.full_name as client_name,
             co.first_name || ' ' || co.last_name as collector_name,
             b.branch_name as branch_name,
             (SELECT COUNT(*) FROM tblLoan prev WHERE prev.customer_id = l.customer_id AND prev.id < l.id) as previous_loans_count,
             CAST(ROUND(JULIANDAY(?) - JULIANDAY(l.date_maturity)) AS INTEGER) as days_due
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      LEFT JOIN tblBranch b ON l.branch_id = b.id
      WHERE l.status IN ('active', 'pastdue') 
        AND (l.date_maturity <= ? OR l.date_maturity <= date(?, '+7 days') OR EXISTS (SELECT 1 FROM tblAmortizationSchedule s WHERE s.loan_id = l.id AND s.status = 'unpaid' AND s.due_date <= ?))
      ORDER BY co.last_name, l.date_maturity ASC
  `;
  try {
    const res = await dbAll(query, [today, today, today, today]);
    console.log("Success", res.length);
  } catch (err) {
    console.error("Error:", err.message);
  }
}
run();
