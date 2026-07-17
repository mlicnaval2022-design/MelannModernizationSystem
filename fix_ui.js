const fs = require('fs');

// 1. Fix Customers.jsx
const customersPath = 'client/src/pages/Customers.jsx';
let customersContent = fs.readFileSync(customersPath, 'utf8');

const customerTarget = `<td>{l.loan_type || '-'}</td>`;
const customerReplacement = `<td>
  {l.loan_type || '-'}
  {String(l.status).toLowerCase() === 'reversed' && <span style={{ color: '#ef4444', marginLeft: '6px', fontWeight: 'bold', fontSize: '11px' }}>(REVERSED)</span>}
</td>`;

if (customersContent.includes(customerTarget)) {
    customersContent = customersContent.replace(customerTarget, customerReplacement);
    fs.writeFileSync(customersPath, customersContent, 'utf8');
    console.log('Fixed Customers.jsx');
}

// 2. Fix ReloanModal.jsx
const reloanPath = 'client/src/components/ReloanModal.jsx';
let reloanContent = fs.readFileSync(reloanPath, 'utf8');

// Fix penaltyAmount
reloanContent = reloanContent.replace(
    'const penaltyAmount = 0;',
    'const penaltyAmount = Number(penalty || 0);'
);

// Fix totalForRelease calculation
reloanContent = reloanContent.replace(
    'const totalAmount = principal + interestAmount;\n    const totalForRelease = totalAmount;',
    'const totalAmount = principal + interestAmount;\n    const totalForRelease = Math.max(totalAmount - charges, 0);'
);

// Fix passbook/penalty fields mapping
reloanContent = reloanContent.replace(
    "{['Balance'].map(label => (",
    "{['Balance', 'Penalty', 'Passbook'].map(label => ("
);

// Fix total breakdown display
reloanContent = reloanContent.replace(
    '<div className="total"><dt>Loan Total</dt><dd>{peso(computed.totalForRelease)}</dd></div>',
    '<div><dt>Less: Balance</dt><dd>{peso(computed.oldBalance)}</dd></div>\n                      <div><dt>Less: Penalty</dt><dd>{peso(computed.penaltyAmount)}</dd></div>\n                      <div><dt>Less: Passbook</dt><dd>{peso(computed.passbookAmount)}</dd></div>\n                      <div><dt>Less: Total Charges</dt><dd>{peso(computed.charges)}</dd></div>\n                      <div className="total"><dt>Total for Release</dt><dd>{peso(computed.totalForRelease)}</dd></div>'
);

// Fix handleSubmit penalty mapping
reloanContent = reloanContent.replace(
    'penalty: 0,',
    'penalty: Number(penalty || 0),'
);

fs.writeFileSync(reloanPath, reloanContent, 'utf8');
console.log('Fixed ReloanModal.jsx');
