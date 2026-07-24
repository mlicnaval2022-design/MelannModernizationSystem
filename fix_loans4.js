const fs = require('fs');
const pathLoansJs = 'server/src/routes/loans.js';

let jsContent = fs.readFileSync(pathLoansJs, 'utf8');

const targetCond = `        if (status === 'relax' || status === 'hold') {
            q += \` AND l.status IN ('active', 'approved') AND LOWER(c.status) = ?\`; 
            p.push(status);
        }`;

const replaceCond = `        if (status === 'relax' || status === 'hold') {
            q += \` AND LOWER(c.status) = ? AND l.id = (SELECT MAX(id) FROM tblLoan WHERE customer_id = c.id)\`; 
            p.push(status);
        }`;

if (jsContent.includes(targetCond)) {
    jsContent = jsContent.replace(targetCond, replaceCond);
    fs.writeFileSync(pathLoansJs, jsContent, 'utf8');
    console.log("Updated loans.js");
} else {
    console.log("Could not find target condition in loans.js");
}
