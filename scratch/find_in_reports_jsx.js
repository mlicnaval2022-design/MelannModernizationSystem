const fs = require('fs');
const content = fs.readFileSync('client/src/pages/Reports.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('Collection Details') || line.includes('daily-collection') || line.includes('selectedCollector')) {
    console.log(`${i+1}: ${line}`);
  }
});
