const { dbGet, dbAll } = require('./src/db/database');

async function test() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const epoch = new Date('2026-01-01T00:00:00Z');
    const diffDays = Math.floor((now - epoch) / (1000 * 60 * 60 * 24));
    const cycleIndex = Math.floor(diffDays / 45);
    const cycleStart = new Date(epoch.getTime() + cycleIndex * 45 * 24 * 60 * 60 * 1000);
    const cycleEnd = new Date(cycleStart.getTime() + 44 * 24 * 60 * 60 * 1000);
    const cycleStartStr = cycleStart.toISOString().split('T')[0];
    const cycleEndStr = cycleEnd.toISOString().split('T')[0];

    console.log("Testing dashboard queries...");
    
    const obj = {
      cycle_start: cycleStartStr,
      cycle_end: cycleEndStr,
      total_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active'`)).c,
      new_customers_this_month: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`)).c,
      expected_collections_today: (await dbGet(`SELECT COALESCE(SUM(amortization), 0) as total FROM tblLoan WHERE status='active'`)).total,
      collections_this_month: (await dbGet(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM tblPayment WHERE status='active' AND strftime('%Y-%m', date_paid) = strftime('%Y-%m', 'now')`)).total,
      collections_last_month: (await dbGet(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM tblPayment WHERE status='active' AND strftime('%Y-%m', date_paid) = strftime('%Y-%m', 'now', '-1 month')`)).total,
      demand_letters_sent: 0,
      total_active_loans: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='active'`)).c,
      total_pastdue: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE date_maturity < ? AND status NOT IN ('fullpaid','reversed')`, [today])).c,
      total_pastdue_amount: (await dbGet(`SELECT COALESCE(SUM(balance), 0) as total FROM tblLoan WHERE date_maturity < ? AND status NOT IN ('fullpaid','reversed')`, [today])).total,
      total_fullpaid: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='fullpaid'`)).c,
      collections_today: (await dbGet(`SELECT COALESCE(SUM(amount_paid),0) as total FROM tblPayment WHERE date_paid=? AND status='active'`, [today])).total,
      releases_today: (await dbGet(`SELECT COALESCE(SUM(principal),0) as total FROM tblLoan WHERE date_released=? AND status != 'reversed'`, [today])).total,
      loans_released_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE date_released=? AND status != 'reversed'`, [today])).c,
      total_portfolio: (await dbGet(`SELECT COALESCE(SUM(balance),0) as total FROM tblLoan WHERE status IN ('active','pastdue')`)).total,
      collector_performance: await dbAll(`
        SELECT 
          co.id, 
          co.first_name || ' ' || co.last_name as name,
          1000000 as target,
          COALESCE((SELECT SUM(amount_paid) FROM tblPayment WHERE collector_id = co.id AND date_paid BETWEEN ? AND ? AND status = 'active'), 0) as collected
        FROM tblCollector co
        WHERE co.is_active = 1
        AND LOWER(co.first_name || ' ' || co.last_name) NOT LIKE '%pastdue%'
        ORDER BY collected DESC
      `, [cycleStartStr, cycleEndStr]),
      recent_activities: await dbAll(`SELECT * FROM tblLogtime ORDER BY created_at DESC LIMIT 10`),
      pending_ci: await dbAll(`SELECT l.id, c.full_name, l.principal, l.created_at FROM tblLoan l JOIN tblCustomer c ON l.customer_id = c.id WHERE l.status = 'pending' ORDER BY l.created_at DESC LIMIT 5`),
      account_status_distribution: await dbAll(`SELECT status, COUNT(*) as count FROM tblLoan GROUP BY status`),
      aging_report: await dbGet(`
        SELECT 
          SUM(CASE WHEN days_overdue BETWEEN 1 AND 30 THEN 1 ELSE 0 END) as tier1,
          SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN 1 ELSE 0 END) as tier2,
          SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as tier3,
          SUM(CASE WHEN days_overdue > 90 THEN 1 ELSE 0 END) as tier4
        FROM (
          SELECT CAST(ROUND(JULIANDAY(?) - JULIANDAY(date_maturity)) AS INTEGER) as days_overdue
          FROM tblLoan WHERE status NOT IN ('fullpaid', 'reversed') AND date_maturity < ?
        )
      `, [today, today])
    };
    
    console.log("Successfully ran all queries!");
  } catch (err) {
    console.error("ERROR CAUGHT:", err.message);
  }
}
test();
