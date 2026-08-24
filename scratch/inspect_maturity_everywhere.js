const fs = require('fs');
const path = require('path');

const filesToInspect = [
  'server/src/services/loanCalculator.js',
  'server/src/routes/customers.js',
  'server/src/routes/loans.js',
  'server/src/routes/reports.js',
  'client/src/pages/Loans.jsx',
  'client/src/pages/PromissoryDisclosure.jsx',
  'client/src/components/ReloanModal.jsx',
  'client/src/components/SoaModal.jsx',
  'client/src/pages/Customers.jsx',
];

filesToInspect.forEach(rel => {
  const full = path.resolve(__dirname, '..', rel);
  if (fs.existsSync(full)) {
    console.log(`=== ${rel} ===`);
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split('\n');
    lines.forEach((l, idx) => {
      if (l.includes('Maturity') || l.includes('maturity') || l.includes('addDays') || l.includes('addCalendarDays') || l.includes('getPayableDays') || l.includes('getWorkingDays') || l.includes('loan_period')) {
        console.log(`  ${idx + 1}: ${l.trim()}`);
      }
    });
  }
});
