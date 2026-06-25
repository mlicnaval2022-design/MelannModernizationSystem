const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const getLastDayOfMonth = (year, month) => {
  const d = new Date(year, month, 0);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
};

const formatDateCIC = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d)) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
};

router.post('/validate', authenticateToken, async (req, res) => {
  try {
    const { year, month, branch_id } = req.body;
    if (!year || !month) return res.status(400).json({ error: 'Year and Month are required' });

    let query = `
      SELECT l.*, c.customer_code, c.first_name, c.last_name, c.middle_name, c.birth_date, c.address, c.civil_status
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      WHERE 1=1
    `;
    let params = [];
    if (branch_id) {
      query += ` AND l.branch_id = ?`;
      params.push(branch_id);
    }
    const loans = await dbAll(query, params);
    
    const errors = [];
    const eligibleRecords = [];
    
    for (const loan of loans) {
      const missingFields = [];
      if (!loan.first_name) missingFields.push('First Name');
      if (!loan.last_name) missingFields.push('Last Name');
      if (!loan.birth_date) missingFields.push('Date of Birth');
      if (!loan.address) missingFields.push('Address');
      
      if (missingFields.length > 0) {
        errors.push({
          customerId: loan.customer_id,
          customerName: `${loan.first_name} ${loan.last_name}`,
          loanCode: loan.loan_code,
          missingFields: missingFields.join(', ')
        });
      } else {
        eligibleRecords.push(loan);
      }
    }
    
    res.json({
      summary: {
        totalEligible: eligibleRecords.length + errors.length,
        ready: eligibleRecords.length,
        withErrors: errors.length
      },
      errors
    });
  } catch (error) {
    console.error('CIC Validation Error:', error);
    res.status(500).json({ error: 'Failed to validate records' });
  }
});

router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { year, month, branch_id } = req.body;
    if (!year || !month) return res.status(400).json({ error: 'Year and Month are required' });

    const batchNumber = `CIC-${year}${String(month).padStart(2, '0')}-${Date.now()}`;
    const refDate = getLastDayOfMonth(year, month);
    const providerCode = 'MLN';

    let query = `
      SELECT l.*, c.customer_code, c.first_name, c.last_name, c.middle_name, c.birth_date, c.address, c.civil_status, b.branch_code
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblBranch b ON l.branch_id = b.id
      WHERE 1=1
    `;
    let params = [];
    if (branch_id) {
      query += ` AND l.branch_id = ?`;
      params.push(branch_id);
    }
    const loans = await dbAll(query, params);
    const validLoans = loans.filter(l => l.first_name && l.last_name && l.birth_date && l.address);
    if (validLoans.length === 0) return res.status(400).json({ error: 'No valid records to generate' });

    const rows = [];
    rows.push(`HD,${providerCode},${refDate},1.0,1,Monthly submission`);

    for (const l of validLoans) {
      const branchCode = l.branch_code || '001';
      const subjNo = l.customer_code;
      
      const idCols = Array(80).fill('');
      idCols[0] = 'ID'; idCols[1] = providerCode; idCols[2] = branchCode; idCols[3] = refDate;
      idCols[4] = subjNo; idCols[6] = l.first_name; idCols[7] = l.last_name; idCols[8] = l.middle_name || '';
      idCols[10] = formatDateCIC(l.birth_date); idCols[15] = l.civil_status || '';
      idCols[29] = 'Home'; idCols[30] = l.address.replace(/,/g, '');
      rows.push(idCols.join(','));

      const ciCols = Array(80).fill('');
      ciCols[0] = 'CI'; ciCols[1] = providerCode; ciCols[2] = branchCode; ciCols[3] = refDate;
      ciCols[4] = subjNo; ciCols[5] = 'Borrower'; ciCols[6] = l.loan_code; ciCols[7] = 'I01';
      ciCols[8] = '1'; ciCols[9] = l.status === 'active' ? '1' : '2'; ciCols[10] = 'PHP';
      ciCols[13] = formatDateCIC(l.date_released); ciCols[15] = formatDateCIC(l.date_maturity);
      ciCols[20] = l.principal.toFixed(2); ciCols[28] = l.balance.toFixed(2);
      rows.push(ciCols.join(','));
    }

    rows.push(`FT,${providerCode},${refDate},${rows.length + 1}`);
    const csvData = rows.join('\\n');

    const batchRes = await dbRun(
      'INSERT INTO tblCICSubmissionBatch (batch_number, month, year, branch_id, total_records, generated_by) VALUES (?, ?, ?, ?, ?, ?)',
      [batchNumber, month, year, branch_id || null, validLoans.length, req.user.id]
    );

    await dbRun(
      'INSERT INTO tblCICSubmissionRecord (batch_id, customer_id, loan_id, record_type, raw_data) VALUES (?, ?, ?, ?, ?)',
      [batchRes.lastID, 0, 0, 'CSV_FILE', csvData]
    );

    res.json({ message: 'CIC Batch generated', batch_number: batchNumber, total_records: validLoans.length, csv_data: csvData });
  } catch (error) {
    console.error('CIC Generate Error:', error);
    res.status(500).json({ error: 'Failed to generate CIC batch' });
  }
});

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const batches = await dbAll('SELECT * FROM tblCICSubmissionBatch ORDER BY generated_at DESC');
    res.json(batches);
  } catch (error) {
    console.error('CIC History Error:', error);
    res.status(500).json({ error: 'Failed to fetch CIC history' });
  }
});

router.get('/readiness/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const missingFields = [];
    if (!customer.first_name) missingFields.push('First Name');
    if (!customer.last_name) missingFields.push('Last Name');
    if (!customer.birth_date) missingFields.push('Date of Birth');
    if (!customer.address) missingFields.push('Address');

    res.json({ status: missingFields.length > 0 ? 'Incomplete' : 'Ready', missingFields });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check readiness' });
  }
});

module.exports = router;
