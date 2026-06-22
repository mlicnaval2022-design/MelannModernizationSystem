const { dbAll, dbGet } = require('./src/db/database');

async function test() {
  const today = new Date().toISOString().split('T')[0];
  try {
    console.log("Testing recent_activities...");
    await dbAll(`SELECT * FROM tblLogtime ORDER BY created_at DESC LIMIT 10`);
    console.log("recent_activities OK");

    console.log("Testing pending_ci...");
    await dbAll(`SELECT l.id, c.full_name, l.principal, l.created_at FROM tblLoan l JOIN tblCustomer c ON l.customer_id = c.id WHERE l.status = 'pending' ORDER BY l.created_at DESC LIMIT 5`);
    console.log("pending_ci OK");

    console.log("Testing account_status_distribution...");
    await dbAll(`SELECT status, COUNT(*) as count FROM tblLoan GROUP BY status`);
    console.log("account_status_distribution OK");

    console.log("Testing aging_report...");
    await dbGet(`
        SELECT 
          SUM(CASE WHEN days_overdue BETWEEN 1 AND 30 THEN 1 ELSE 0 END) as tier1,
          SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN 1 ELSE 0 END) as tier2,
          SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as tier3,
          SUM(CASE WHEN days_overdue > 90 THEN 1 ELSE 0 END) as tier4
        FROM (
          SELECT CAST(ROUND(JULIANDAY(?) - JULIANDAY(date_maturity)) AS INTEGER) as days_overdue
          FROM tblLoan WHERE status NOT IN ('fullpaid', 'reversed') AND date_maturity < ?
        )
      `, [today, today]);
    console.log("aging_report OK");
    process.exit(0);
  } catch (err) {
    console.error("ERROR:", err);
    process.exit(1);
  }
}
test();
