const fs = require('fs');
const pathLoansJs = 'server/src/routes/loans.js';

let jsContent = fs.readFileSync(pathLoansJs, 'utf8');

const queryStart = jsContent.indexOf('let q = `SELECT l.*, COALESCE(NULLIF(c.full_name');
const queryEnd = jsContent.indexOf('const p = [];', queryStart);

if (queryStart !== -1 && queryEnd !== -1) {
    const replacementQuery = `let q = \`SELECT l.*, COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown Customer (Deleted)') as customer_name, c.customer_code, c.status as customer_status, (SELECT h.remarks FROM tblCustomerStatusHistory h WHERE h.customer_id = l.customer_id AND LOWER(h.new_status) = LOWER(c.status) ORDER BY h.created_at DESC, h.id DESC LIMIT 1) as status_note, c.photo_client, c.photo_id_front, co.first_name || ' ' || co.last_name as collector_name, b.branch_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id LEFT JOIN tblBranch b ON l.branch_id = b.id WHERE 1=1\`;\n    `;
    
    jsContent = jsContent.substring(0, queryStart) + replacementQuery + jsContent.substring(queryEnd);
    
    // Now replace the status condition
    const statusCondStart = jsContent.indexOf('if (status) { q += ` AND l.status = ?`; p.push(status); }');
    if (statusCondStart !== -1) {
        const replacementCond = `if (status) { 
        if (status === 'relax' || status === 'hold') {
            q += \` AND l.status IN ('active', 'approved') AND LOWER(c.status) = ?\`; 
            p.push(status);
        } else {
            q += \` AND l.status = ?\`; 
            p.push(status);
        }
    }`;
        jsContent = jsContent.substring(0, statusCondStart) + replacementCond + jsContent.substring(statusCondStart + 'if (status) { q += ` AND l.status = ?`; p.push(status); }'.length);
        
        fs.writeFileSync(pathLoansJs, jsContent, 'utf8');
        console.log("Updated loans.js successfully");
    } else {
        console.log("Could not find status condition");
    }
} else {
    console.log("Could not find query start/end");
}
