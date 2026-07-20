const fs = require('fs');
const path = 'client/src/pages/Customers.jsx';
let lines = fs.readFileSync(path, 'utf8').split('\n');

const replacement = `  const getLoanStatusLabel = (loan) => {
    if (!loan) return '—';
    const lstatus = (loan.status || '').toLowerCase();
    
    if (lstatus === 'reversed') return 'Reversed';
    if (lstatus === 'fullpaid' || lstatus === 'fully paid' || lstatus === 'fully_paid') return 'Fully Paid';
    
    if (['active', 'approved'].includes(lstatus)) {
        const cstatus = (activeCustomer?.status || '').toUpperCase();
        if (cstatus === 'RELAX') return 'Relax';
        if (cstatus === 'HOLD') return 'Hold';
        
        const type = (loan.loan_type || '').toLowerCase();
        if (type === 'recon') return 'Recon';
        if (type === 're-loan' || type === 'reloan' || loan.status === 'reloan_pending') return 'Reloan';
        if (type === 'new') return 'New';
        
        if (loan.date_maturity) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const maturity = new Date(loan.date_maturity);
          maturity.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((today.getTime() - maturity.getTime()) / (1000 * 3600 * 24));
          if (diffDays > 45) return 'Pastdue';
          if (diffDays >= 1) return 'Overdue';
        }
    }
    return loan.status ? loan.status.replace(/_/g, ' ') : '—';
  };

  const getLoanStatusClass = (loan) => {
    if (!loan) return 'unknown';
    const lstatus = (loan.status || '').toLowerCase();
    
    if (lstatus === 'reversed') return 'reversed';
    if (lstatus === 'fullpaid' || lstatus === 'fully paid' || lstatus === 'fully_paid') return 'fully-paid';
    
    if (['active', 'approved'].includes(lstatus)) {
        const cstatus = (activeCustomer?.status || '').toUpperCase();
        if (cstatus === 'RELAX') return 'relax';
        if (cstatus === 'HOLD') return 'hold';
        
        const type = (loan.loan_type || '').toLowerCase();
        if (type === 'recon') return 'recon';
        if (type === 're-loan' || type === 'reloan' || loan.status === 'reloan_pending') return 'reloan';
        if (type === 'new') return 'new';
        
        if (loan.date_maturity) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const maturity = new Date(loan.date_maturity);
          maturity.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((today.getTime() - maturity.getTime()) / (1000 * 3600 * 24));
          if (diffDays > 45) return 'pastdue';
          if (diffDays >= 1) return 'overdue';
        }
    }
    return lstatus || 'unknown';
  };`;

// Find where to replace
const startIndex = lines.findIndex(l => l.includes('const getLoanStatusLabel = (loan) => {'));
const endIndex = lines.findIndex((l, i) => i > startIndex && l.includes('const getCalculatedCustomerStatus = (data) => {'));

if (startIndex !== -1 && endIndex !== -1) {
    const newLines = [
        ...lines.slice(0, startIndex),
        replacement,
        ...lines.slice(endIndex)
    ];
    fs.writeFileSync(path, newLines.join('\n'), 'utf8');
    console.log("Successfully replaced getLoanStatus logic by array splicing!");
} else {
    console.log("Not found, start:", startIndex, "end:", endIndex);
}
