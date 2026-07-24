const { dbAll } = require('./src/db/database');
async function test() {
  try {
    const date = '2026-07-14';
    const branch_id = '';
    
    let lCond = `l.date_released = ? AND l.status IN ('active', 'fully_paid')`;
    const lParams = [date];
    if (branch_id) { lCond += ` AND l.branch_id = ?`; lParams.push(branch_id); }

    const releases = await dbAll(`
      SELECT l.id, l.customer_id, l.loan_code, l.principal, l.net_proceeds, l.loan_type, l.date_released, l.created_at, l.dcr_id, l.service_fee, l.insurance, l.balance, l.previous_balance,
             c.customer_code, c.first_name, c.last_name, u.full_name as encoded_by,
             co.first_name || ' ' || co.last_name as collector_name,
             (SELECT SUM(amount) FROM tblTransaction WHERE category = CAST(l.customer_id AS TEXT) AND transaction_type = 'Penalty' AND transaction_date = l.date_released AND status = 'active') as today_penalty,
             (SELECT SUM(amount) FROM tblTransaction WHERE category = CAST(l.customer_id AS TEXT) AND transaction_type = 'Passbook' AND transaction_date = l.date_released AND status = 'active') as today_passbook
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblUser u ON l.created_by = u.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE ${lCond}
    `, lParams);
    console.log('Releases:', releases.length);
  } catch(e) {
    console.error('ERROR:', e.message);
  }
}
test();
