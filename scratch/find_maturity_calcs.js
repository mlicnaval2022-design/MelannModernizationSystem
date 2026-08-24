const fs = require('fs');
const path = require('path');

function search(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') search(fullPath);
    } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('calculateMaturity') || content.includes('computeMaturity') || content.includes('date_maturity') || content.includes('generateAmortizationSchedule') || content.includes('tblAmortizationSchedule')) {
        console.log(`Found in: ${fullPath}`);
      }
    }
  }
}

search(path.resolve(__dirname, '../server/src'));
search(path.resolve(__dirname, '../client/src'));
