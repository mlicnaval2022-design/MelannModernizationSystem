const fs = require('fs');
const path = 'client/src/pages/Loans.jsx';
let lines = fs.readFileSync(path, 'utf8').split('\n');

const tabReplacement = `          { value: '', label: 'All Status' },
          { value: 'relax', label: 'Relax' },
          { value: 'hold', label: 'Hold' },`;

const tabIndex = lines.findIndex(l => l.includes("{ value: '', label: 'All Status' },"));
if (tabIndex !== -1) {
    lines[tabIndex] = tabReplacement;
}

const badgeStart = lines.findIndex(l => l.includes("r.status === 'approved' ? <span className=\"badge badge-warning\">Approved (Not Released)</span>"));
if (badgeStart !== -1) {
    const replacementBadge = `                      {(() => {
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
                      })()}`;
                      
    lines.splice(badgeStart, 2, replacementBadge);
    fs.writeFileSync(path, lines.join('\n'), 'utf8');
    console.log("Successfully replaced Loans.jsx array splicing!");
} else {
    console.log("Not found in Loans.jsx");
}
