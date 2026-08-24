const fs = require('fs');
const content = fs.readFileSync('client/src/components/SoaModal.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('getPaymentStatusText') || line.includes('statusText') || line.includes('Fully Paid(Recon)')) {
    console.log(`${i+1}: ${line}`);
  }
});
