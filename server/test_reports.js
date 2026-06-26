const { dbAll } = require('./src/db/database');
async function run() {
  const queries = [
    // daily-collection
    [`SELECT p.*, l.loan_code, l.loan_type, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblCollector co ON p.collector_id = co.id WHERE p.date_paid BETWEEN ? AND ? AND p.status = 'active' ORDER BY p.date_paid, co.last_name`, ['2026-06-23', '2026-06-24']],
    // monthly-releases
    [`SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE strftime('%Y',l.date_released)=? AND strftime('%m',l.date_released)=? AND l.status != 'reversed' ORDER BY l.date_released`, ['2026', '06']],
    // past-due
    [`SELECT l.*, c.full_name as customer_name, c.customer_code, c.address, c.contact, co.first_name || ' ' || co.last_name as collector_name, CAST(ROUND(JULIANDAY('now') - JULIANDAY(l.date_maturity)) AS INTEGER) as days_overdue FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.date_maturity < ? AND l.status NOT IN ('fullpaid','reversed') ORDER BY l.date_maturity ASC`, ['2026-06-24']],
    // payments-encoded
    [`SELECT p.*, l.loan_code, c.full_name as customer_name, u.full_name as encoded_by_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblUser u ON p.encoded_by = u.id WHERE p.date_paid BETWEEN ? AND ? AND p.status = 'active' ORDER BY p.created_at`, ['2026-06-23', '2026-06-24']],
    // payments-reversed
    [`SELECT p.*, l.loan_code, c.full_name as customer_name, u.full_name as reversed_by_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblUser u ON p.reversed_by = u.id WHERE p.reversed_at BETWEEN ? AND ? AND p.status = 'reversed' ORDER BY p.reversed_at DESC`, ['2026-06-23', '2026-06-24']],
    // maturity-check
    [`SELECT l.*, c.full_name as customer_name, c.contact, co.first_name || ' ' || co.last_name as collector_name, CAST(ROUND(JULIANDAY(l.date_maturity) - JULIANDAY('now')) AS INTEGER) as days_to_maturity FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.status = 'active' AND JULIANDAY(l.date_maturity) - JULIANDAY('now') BETWEEN 0 AND ? ORDER BY l.date_maturity ASC`, [30]],
    // full-paid
    [`SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.status = 'fullpaid'`, []],
    // loan-type
    [`SELECT loan_type, COUNT(*) as count, SUM(principal) as total_principal, SUM(balance) as total_balance, status FROM tblLoan WHERE status != 'reversed' GROUP BY loan_type, status ORDER BY loan_type`, []],
    // collection-sheet
    [`SELECT l.*, c.full_name as customer_name, c.customer_code, c.address, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.collector_id = ? AND l.status IN ('active','pastdue') ORDER BY c.last_name`, [1]]
  ];

  for (let i = 0; i < queries.length; i++) {
    try {
      await dbAll(queries[i][0], queries[i][1]);
      console.log(`Query ${i} success`);
    } catch (err) {
      console.error(`Query ${i} FAILED:`, err.message);
    }
  }
}
run();
