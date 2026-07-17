const fs = require('fs');
const path = 'server/src/routes/reports.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix the yesterday logic
content = content.replace(
  "const yesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0];",
  "const latestPaymentDateRes = await dbGet('SELECT MAX(date_paid) as max_date FROM tblPayment WHERE status IN (\\'active\\', \\'penalty\\') AND date_paid < ?', [today]);\n    const latestPaymentDate = latestPaymentDateRes && latestPaymentDateRes.max_date ? latestPaymentDateRes.max_date : new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0];"
);

content = content.replace(
  "yesterday_str: yesterday,",
  "yesterday_str: latestPaymentDate,"
);

content = content.replace(
  "collections_yesterday: (await dbGet(`SELECT COALESCE(SUM(amount_paid),0) as total FROM tblPayment WHERE date_paid=? AND status IN ('active', 'penalty')`, [yesterday])).total,",
  "collections_yesterday: (await dbGet(`SELECT COALESCE(SUM(amount_paid),0) as total FROM tblPayment WHERE date_paid=? AND status IN ('active', 'penalty')`, [latestPaymentDate])).total,"
);

// 2. Fix the releases to match DCR
content = content.replace(
  "releases_today: (await dbGet(`SELECT COALESCE(SUM(principal),0) as total FROM tblLoan WHERE date_released=? AND status != 'reversed'`, [today])).total,",
  "releases_today: (await dbGet(`SELECT COALESCE(SUM(principal),0) as total FROM tblLoan WHERE ((LOWER(COALESCE(loan_type, '')) IN ('recon', 'reconstruct', 'reconstructed') AND date(created_at) = ?) OR (LOWER(COALESCE(loan_type, '')) NOT IN ('recon', 'reconstruct', 'reconstructed') AND date_released = ?)) AND status IN ('active', 'fully_paid')`, [today, today])).total,"
);

content = content.replace(
  "loans_released_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE date_released=? AND status != 'reversed'`, [today])).c,",
  "loans_released_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE ((LOWER(COALESCE(loan_type, '')) IN ('recon', 'reconstruct', 'reconstructed') AND date(created_at) = ?) OR (LOWER(COALESCE(loan_type, '')) NOT IN ('recon', 'reconstruct', 'reconstructed') AND date_released = ?)) AND status IN ('active', 'fully_paid')`, [today, today])).c,"
);

// 3. Fix the customers-metrics duplicate issue by just removing the first 8 lines if they are duplicate.
// Wait, I will just checkout first!

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed reports.js');
