const fs = require('fs');
const pathLoansJsx = 'client/src/pages/Loans.jsx';
const pathLoansJs = 'server/src/routes/loans.js';

// Update Loans.jsx
let jsxContent = fs.readFileSync(pathLoansJsx, 'utf8');

const targetTabs = `{ value: '', label: 'All Status' },`;
const replaceTabs = `{ value: '', label: 'All Status' },
          { value: 'relax', label: 'Relax' },
          { value: 'hold', label: 'Hold' },`;
if (jsxContent.includes(targetTabs)) {
    jsxContent = jsxContent.replace(targetTabs, replaceTabs);
}

const targetBadge = `                    <td>
                      {r.status === 'approved' ? <span className="badge badge-warning">Approved (Not Released)</span> :
                       <span className={\`badge badge-\${r.status}\`}>{r.status}</span>}
                    </td>`;
const replaceBadge = `                    <td>
                      {(() => {
                        const isContext = ['relax', 'hold'].includes(r.customer_status?.toLowerCase());
                        const badgeText = isContext ? r.customer_status.toUpperCase() : (r.status === 'approved' ? 'Approved (Not Released)' : r.status);
                        const badgeClass = isContext ? r.customer_status.toLowerCase() : r.status;
                        return (
                          <>
                            <span className={\`badge badge-\${badgeClass}\`}>{badgeText}</span>
                            {isContext && r.status_note && (
                              <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b', maxWidth: '150px', whiteSpace: 'normal', wordWrap: 'break-word', lineHeight: '1.2' }}>
                                <i>Note: {r.status_note}</i>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </td>`;
if (jsxContent.includes(targetBadge)) {
    jsxContent = jsxContent.replace(targetBadge, replaceBadge);
}

fs.writeFileSync(pathLoansJsx, jsxContent, 'utf8');

// Update loans.js
let jsContent = fs.readFileSync(pathLoansJs, 'utf8');

const targetQuery = `let q = \`SELECT l.*, COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown Customer (Deleted)') as customer_name, c.customer_code, c.photo_client, c.photo_id_front, co.first_name || ' ' || co.last_name as collector_name, b.branch_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id LEFT JOIN tblBranch b ON l.branch_id = b.id WHERE 1=1\`;
    const p = [];
    if (search) { q += \` AND (c.full_name LIKE ? OR l.loan_code LIKE ? OR c.customer_code LIKE ?)\`; p.push(\`%\${search}%\`, \`%\${search}%\`, \`%\${search}%\`); }
    if (status) { q += \` AND l.status = ?\`; p.push(status); }`;

const replaceQuery = `let q = \`SELECT l.*, COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown Customer (Deleted)') as customer_name, c.customer_code, c.status as customer_status, (SELECT h.remarks FROM tblCustomerStatusHistory h WHERE h.customer_id = l.customer_id AND LOWER(h.new_status) = LOWER(c.status) ORDER BY h.created_at DESC, h.id DESC LIMIT 1) as status_note, c.photo_client, c.photo_id_front, co.first_name || ' ' || co.last_name as collector_name, b.branch_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id LEFT JOIN tblBranch b ON l.branch_id = b.id WHERE 1=1\`;
    const p = [];
    if (search) { q += \` AND (c.full_name LIKE ? OR l.loan_code LIKE ? OR c.customer_code LIKE ?)\`; p.push(\`%\${search}%\`, \`%\${search}%\`, \`%\${search}%\`); }
    if (status) { 
        if (status === 'relax' || status === 'hold') {
            q += \` AND l.status IN ('active', 'approved') AND LOWER(c.status) = ?\`; 
            p.push(status);
        } else {
            q += \` AND l.status = ?\`; 
            p.push(status);
        }
    }`;

if (jsContent.includes(targetQuery)) {
    jsContent = jsContent.replace(targetQuery, replaceQuery);
    fs.writeFileSync(pathLoansJs, jsContent, 'utf8');
    console.log("Updated loans.js");
} else {
    console.log("Could not find target query in loans.js");
}

console.log("Script finished");
