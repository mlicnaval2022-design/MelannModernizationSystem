const fs = require('fs');
let code = fs.readFileSync('client/src/pages/Payments.jsx', 'utf8');

const badBlock = `    try {
      const payload = {
        loan_id: activeLoan.id,
        or_number: 'N/A',
        date_paid: form.date_paid,
        amount_paid: form.amount_paid,
        collector_id: selectedCollector,
        remarks: form.remarks,
        force_duplicate
      }
      const r = await API.post('/payments', payload)
`;

code = code.replace(badBlock, '');

fs.writeFileSync('client/src/pages/Payments.jsx', code);
