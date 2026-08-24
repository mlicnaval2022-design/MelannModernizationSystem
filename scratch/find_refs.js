const fs = require('fs');
const path = require('path');

function searchDir(dir, patterns) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        searchDir(fullPath, patterns);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      patterns.forEach(p => {
        if (content.includes(p)) {
          console.log(`Found "${p}" in ${fullPath}`);
        }
      });
    }
  }
}

searchDir(path.resolve(__dirname, '../server/src'), [
  'postPriorLoanBalancePayment',
  'getReleaseChargeBreakdown',
  'previous_balance',
  'isExcludedCollectionPayment',
  'buildCollectionPaymentExclusionSql',
  'reconLoanTypesSql'
]);

searchDir(path.resolve(__dirname, '../client/src'), [
  'previous_balance',
  'Recon',
  'RECON'
]);
