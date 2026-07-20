const fs = require('fs');
const pathLoansJsx = 'client/src/pages/Loans.jsx';
const pathCustJs = 'server/src/routes/customers.js';

// 1. Update Loans.jsx
let jsxLines = fs.readFileSync(pathLoansJsx, 'utf8').split('\n');

// Add handleEditNote
const idxLoad = jsxLines.findIndex(l => l.includes('const load = () => {'));
if (idxLoad !== -1) {
    const handleEditNote = `
  const handleEditNote = (loan) => {
    const newNote = window.prompt(\`Edit note for \${loan.customer_name}:\`, loan.status_note || '');
    if (newNote !== null) {
       API.put(\`/customers/\${loan.customer_id}/status-note\`, { note: newNote, status: loan.customer_status })
         .then(() => {
            load();
         })
         .catch(err => alert('Failed to update note: ' + (err.response?.data?.error || err.message)));
    }
  }
`;
    jsxLines.splice(idxLoad, 0, handleEditNote);
}

// Update PAID display
const idxPaid = jsxLines.findIndex(l => l.includes("r.status === 'fullpaid' ? <span className=\"text-success\">PAID</span>"));
if (idxPaid !== -1) {
    jsxLines[idxPaid] = jsxLines[idxPaid].replace(
        "r.status === 'fullpaid' ? <span className=\"text-success\">PAID</span>", 
        "r.status === 'fullpaid' || Number(r.balance || 0) <= 0 ? <span className=\"text-success\">PAID</span>"
    );
}

// Add Edit Note button
const idxViewBtn = jsxLines.findIndex(l => l.includes("<button className=\"btn btn-secondary btn-sm\" onClick={() => viewDetail(r.id)}>View</button>"));
if (idxViewBtn !== -1) {
    const btn = `                        {['relax', 'hold'].includes(r.customer_status?.toLowerCase()) && (
                          <button className="btn btn-light btn-sm" style={{ border: '1px solid #cbd5e1' }} onClick={() => handleEditNote(r)}>Edit Note</button>
                        )}`;
    jsxLines.splice(idxViewBtn + 1, 0, btn);
}

fs.writeFileSync(pathLoansJsx, jsxLines.join('\n'), 'utf8');


// 2. Update customers.js
let custContent = fs.readFileSync(pathCustJs, 'utf8');
if (!custContent.includes('/status-note')) {
    const endpoint = `
router.put('/:id/status-note', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { note, status } = req.body;
    const latest = await dbGet(\`SELECT id FROM tblCustomerStatusHistory WHERE customer_id = ? AND LOWER(new_status) = LOWER(?) ORDER BY id DESC LIMIT 1\`, [req.params.id, status]);
    if (latest) {
       await dbRun(\`UPDATE tblCustomerStatusHistory SET remarks = ? WHERE id = ?\`, [note, latest.id]);
       res.json({ message: 'Note updated' });
    } else {
       res.status(404).json({ error: 'Status history not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;`;
    custContent = custContent.replace('module.exports = router;', endpoint);
    fs.writeFileSync(pathCustJs, custContent, 'utf8');
}

console.log("Updated both files successfully");
