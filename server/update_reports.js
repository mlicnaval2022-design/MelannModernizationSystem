const fs = require('fs');
const file = 'd:/ModernizationMelannSystem/server/src/routes/reports.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/JOIN tblCustomer c ON ([a-zA-Z]+)\.customer_id = c\.id/g, 'JOIN tblCustomer c ON $1.customer_id = c.id JOIN tblLoan l ON $1.loan_id = l.id');
content = content.replace(/LOWER\(c\.status\) IN \('active', 'recon'\)/g, "LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')");

fs.writeFileSync(file, content);
console.log("Replaced successfully");
