const fs = require('fs');
const content = fs.readFileSync('client/src/pages/Customers.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('Payment History') || line.includes('payment_history') || line.includes('getPaymentStatusBadge') || line.includes('Fully Paid(Recon)')) {
    console.log(`${i+1}: ${line}`);
  }
});
