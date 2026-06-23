const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, uploadDir); },
  filename: function(req, file, cb) { cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')); }
});
const upload = multer({ storage });

router.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

router.get('/list/fully-paid', authenticateToken, async (req, res) => {
  try {
    const fullyPaid = await dbAll(`
      SELECT 
        c.id, c.customer_code, c.full_name as client_name, c.status,
        co.first_name || ' ' || co.last_name as collector_name,
        (SELECT l.principal FROM tblLoan l WHERE l.customer_id = c.id ORDER BY l.date_released DESC LIMIT 1) as last_loan_amount,
        (SELECT l.date_released FROM tblLoan l WHERE l.customer_id = c.id ORDER BY l.date_released DESC LIMIT 1) as date_released,
        (SELECT p.date_paid FROM tblPayment p JOIN tblLoan l ON p.loan_id = l.id WHERE l.customer_id = c.id AND l.status='fullpaid' ORDER BY p.date_paid DESC LIMIT 1) as date_fully_paid,
        (SELECT COUNT(*) FROM tblLoan l WHERE l.customer_id = c.id) as loan_cycles
      FROM tblCustomer c
      LEFT JOIN tblCollector co ON c.collector_id = co.id
      WHERE c.status = 'FULLY PAID'
    `);
    
    for (let c of fullyPaid) {
      const stats = await dbGet(`SELECT COUNT(*) as total_sched, SUM(CASE WHEN s.status='paid' AND date_paid > due_date THEN 1 ELSE 0 END) as late FROM tblAmortizationSchedule s JOIN tblLoan l ON s.loan_id=l.id WHERE l.customer_id=?`, [c.id]);
      const pastDues = await dbGet(`SELECT COUNT(*) as pd FROM tblLoan WHERE customer_id=? AND status='pastdue'`, [c.id]);
      
      let score = 100;
      if (stats && stats.total_sched > 0) score -= ((stats.late || 0) * 2);
      if (pastDues) score -= ((pastDues.pd || 0) * 20);
      c.credit_score = Math.max(0, score);
    }
    res.json(fullyPaid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, status, branch_id } = req.query;
    let q = `SELECT c.*, b.branch_name, co.first_name || ' ' || co.last_name as collector_name FROM tblCustomer c LEFT JOIN tblBranch b ON c.branch_id = b.id LEFT JOIN tblCollector co ON c.collector_id = co.id WHERE 1=1`;
    const p = [];
    if (search) { q += ` AND (c.full_name LIKE ? OR c.customer_code LIKE ? OR c.contact LIKE ?)`; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { q += ` AND c.status = ?`; p.push(status); }
    if (branch_id) { q += ` AND c.branch_id = ?`; p.push(branch_id); }
    q += ` ORDER BY c.last_name, c.first_name`;
    res.json(await dbAll(q, p));
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const customer = await dbGet(`SELECT c.*, b.branch_name, co.first_name || ' ' || co.last_name as collector_name FROM tblCustomer c LEFT JOIN tblBranch b ON c.branch_id = b.id LEFT JOIN tblCollector co ON c.collector_id = co.id WHERE c.id = ?`, [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const loans = await dbAll(`SELECT * FROM tblLoan WHERE customer_id = ? ORDER BY created_at DESC`, [req.params.id]);
    const payments = await dbAll(`SELECT p.*, l.loan_code FROM tblPayment p JOIN tblLoan l ON p.loan_id = l.id WHERE p.customer_id = ? ORDER BY p.date_paid DESC, p.created_at DESC`, [req.params.id]);
    res.json({ ...customer, loans, payments });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/:id/credit-eval', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const stats = await dbGet(`
      SELECT 
        COUNT(l.id) as total_loans,
        SUM(l.principal) as total_amount_borrowed,
        MAX(l.principal) as last_loan_amount
      FROM tblLoan l WHERE l.customer_id = ?`, [id]);
      
    const sched = await dbGet(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN s.status='paid' AND date_paid <= due_date THEN 1 ELSE 0 END) as on_time,
        SUM(CASE WHEN s.status='paid' AND date_paid > due_date THEN 1 ELSE 0 END) as late
      FROM tblAmortizationSchedule s JOIN tblLoan l ON s.loan_id=l.id WHERE l.customer_id = ?`, [id]);

    const pd = await dbGet(`SELECT COUNT(*) as past_due_occurrences FROM tblLoan WHERE customer_id = ? AND status='pastdue'`, [id]);
    const recon = await dbGet(`SELECT COUNT(*) as recon_history FROM tblCustomerStatusHistory WHERE customer_id = ? AND new_status='RECON'`, [id]);
    
    let score = 100 - ((sched ? sched.late : 0) * 2) - ((pd ? pd.past_due_occurrences : 0) * 20);
    score = Math.max(0, score);

    res.json({
      total_loans: stats ? stats.total_loans : 0,
      total_amount_borrowed: stats ? stats.total_amount_borrowed : 0,
      last_loan_amount: stats ? stats.last_loan_amount : 0,
      on_time_payments: sched ? sched.on_time : 0,
      late_payments: sched ? sched.late : 0,
      past_due_occurrences: pd ? pd.past_due_occurrences : 0,
      recon_history: recon ? recon.recon_history : 0,
      credit_score: score
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/reloan-eval', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const stats = await dbGet(`
      SELECT 
        COUNT(l.id) as total_loans,
        SUM(l.principal) as total_amount_borrowed,
        MAX(l.principal) as last_loan_amount,
        MAX(l.date_released) as last_loan_date,
        SUM(CASE WHEN l.status='fullpaid' THEN 1 ELSE 0 END) as successful_loans
      FROM tblLoan l WHERE l.customer_id = ?`, [id]);

    const lastPaid = await dbGet(`
      SELECT p.date_paid as last_fully_paid_date 
      FROM tblPayment p JOIN tblLoan l ON p.loan_id = l.id 
      WHERE l.customer_id = ? AND l.status='fullpaid' 
      ORDER BY p.date_paid DESC LIMIT 1`, [id]);

    const sched = await dbGet(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN s.status='paid' AND date_paid <= due_date THEN 1 ELSE 0 END) as on_time
      FROM tblAmortizationSchedule s JOIN tblLoan l ON s.loan_id=l.id WHERE l.customer_id = ?`, [id]);

    const pd = await dbGet(`SELECT COUNT(*) as past_due_occurrences FROM tblLoan WHERE customer_id = ? AND status='pastdue'`, [id]);
    const recon = await dbGet(`SELECT COUNT(*) as recon_history FROM tblCustomerStatusHistory WHERE customer_id = ? AND new_status='RECON'`, [id]);

    const activeOrPastDueLoans = await dbGet(`SELECT COUNT(*) as count, SUM(balance) as total_balance FROM tblLoan WHERE customer_id = ? AND status IN ('active', 'pastdue')`, [id]);

    let collection_efficiency = 0;
    if (sched && sched.total_payments > 0) {
      collection_efficiency = Math.round((sched.on_time / sched.total_payments) * 100);
    }

    const is_fully_paid = customer.status === 'FULLY PAID';
    const no_active_loan = !activeOrPastDueLoans || activeOrPastDueLoans.count === 0;
    const no_outstanding_balance = !activeOrPastDueLoans || activeOrPastDueLoans.total_balance === 0;
    const is_good_standing = is_fully_paid && no_active_loan && no_outstanding_balance;

    const last_loan = stats && stats.last_loan_amount ? stats.last_loan_amount : 0;
    
    // Recommendations logic
    const conservative = last_loan;
    const standard = Math.round(last_loan * 1.2);
    const progressive = Math.round(last_loan * 1.5);

    res.json({
      last_loan_amount: last_loan,
      last_loan_date: stats ? stats.last_loan_date : null,
      last_fully_paid_date: lastPaid ? lastPaid.last_fully_paid_date : null,
      total_loans: stats ? stats.total_loans : 0,
      successful_loans: stats ? stats.successful_loans : 0,
      past_due_occurrences: pd ? pd.past_due_occurrences : 0,
      recon_history: recon ? recon.recon_history : 0,
      total_amount_borrowed: stats ? stats.total_amount_borrowed : 0,
      collection_efficiency: collection_efficiency,
      is_eligible: is_good_standing,
      recommendations: {
        conservative: conservative,
        standard: standard,
        progressive: progressive
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, middle_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id,
      sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, 
      loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality,
      home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit,
      proposed_principal,
      customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address,
      messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes,
      business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no,
      id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client
    } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    const count = (await dbGet('SELECT COUNT(*) as c FROM tblCustomer')).c;
    const customer_code = String(count + 1).padStart(4, '0');
    
    const cols = ['customer_code', 'first_name', 'last_name', 'middle_name', 'full_name', 'address', 'contact', 'birth_date', 'civil_status', 'occupation', 'branch_id', 'collector_id', 'status', 'sitio', 'purok', 'brgy', 'city', 'gender', 'secondary_contact', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral', 'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality', 'home_status', 'business_address', 'business_location', 'business_years', 'business_months', 'business_ownership', 'business_permit', 'customer_classification', 'risk_category', 'cic_verification', 'province', 'zip_code', 'length_of_stay', 'previous_address', 'messenger_account', 'preferred_contact_method', 'preferred_contact_time_from', 'preferred_contact_time_to', 'contact_notes', 'business_type', 'business_name', 'business_employees', 'permit_date_issued', 'permit_place_issued', 'permit_no', 'id_place_of_issue', 'tin_number', 'sss_number', 'id_notes', 'photo_id_front', 'photo_id_back', 'photo_business_proof', 'photo_client'];
    
    const vals = [customer_code, first_name, last_name, middle_name || null, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, 'active', sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit, customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address, messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes, business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no, id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client];

    const placeholders = cols.map(() => '?').join(',');
    const result = await dbRun(`INSERT INTO tblCustomer (${cols.join(',')}) VALUES (${placeholders})`, vals);
    
    // Auto-create CI Application (pending loan)
    const lCount = (await dbGet('SELECT COUNT(*) as c FROM tblLoan')).c;
    const loan_code = `LN-${String(lCount + 1).padStart(6, '0')}`;
    const date_released = new Date().toISOString().split('T')[0];
    const principal = Number(proposed_principal) || 0;
    const amortization = principal > 0 ? (principal * 1.15) / 45 : 0;

    await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, loan_period, date_released, amortization, status, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, result.lastID, collector_id, branch_id, 'New', principal, 15, 45, date_released, amortization, 'pending', loan_purpose, req.user.id]
    );

    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'CREATE', 'CUSTOMER', result.lastID, `Created: ${full_name}`]);
    res.status(201).json({ id: result.lastID, customer_code, full_name });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, middle_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status,
      sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, 
      loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality,
      home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit,
      customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address,
      messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes,
      business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no,
      id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client
    } = req.body;
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    
    const updateCols = ['first_name', 'last_name', 'middle_name', 'full_name', 'address', 'contact', 'birth_date', 'civil_status', 'occupation', 'branch_id', 'collector_id', 'status', 'sitio', 'purok', 'brgy', 'city', 'gender', 'secondary_contact', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral', 'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality', 'home_status', 'business_address', 'business_location', 'business_years', 'business_months', 'business_ownership', 'business_permit', 'customer_classification', 'risk_category', 'cic_verification', 'province', 'zip_code', 'length_of_stay', 'previous_address', 'messenger_account', 'preferred_contact_method', 'preferred_contact_time_from', 'preferred_contact_time_to', 'contact_notes', 'business_type', 'business_name', 'business_employees', 'permit_date_issued', 'permit_place_issued', 'permit_no', 'id_place_of_issue', 'tin_number', 'sss_number', 'id_notes', 'photo_id_front', 'photo_id_back', 'photo_business_proof', 'photo_client', 'updated_at'];
    
    const vals = [first_name, last_name, middle_name || null, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status || 'active', sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit, customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address, messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes, business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no, id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client, req.params.id];
    
    const setClause = updateCols.map(c => c === 'updated_at' ? "updated_at=datetime('now')" : `${c}=?`).join(', ');
    await dbRun(`UPDATE tblCustomer SET ${setClause} WHERE id=?`, vals);
    res.json({ message: 'Customer updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/:id/relax', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loanQuery = await dbGet(`SELECT SUM(balance) as total_balance FROM tblLoan WHERE customer_id = ? AND status IN ('active', 'pastdue')`, [req.params.id]);
    const balance = loanQuery ? Number(loanQuery.total_balance) || 0 : 0;
    
    if (balance > 0) {
      return res.status(400).json({ error: `Cannot relax this client because there is an outstanding balance amounting to ₱${balance.toLocaleString('en-US', {minimumFractionDigits: 2})}. Please settle the remaining balance before proceeding.` });
    }
    
    await dbRun(`UPDATE tblCustomer SET status='inactive', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RELAX', 'CUSTOMER', req.params.id, `Relaxed client account`]);
    res.json({ message: 'Customer relaxed successfully' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/:id/reloan', authenticateToken, async (req, res) => {
  try {
    const { principal, loan_period, remarks } = req.body;
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const lCount = (await dbGet('SELECT COUNT(*) as c FROM tblLoan')).c;
    const loan_code = `LN-${String(lCount + 1).padStart(6, '0')}`;
    const date_released = new Date().toISOString().split('T')[0];
    const amount = Number(principal) || 0;
    const period = Number(loan_period) || 45;
    const amortization = amount > 0 ? (amount * 1.15) / period : 0;
    
    await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, loan_period, date_released, amortization, status, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, customer.id, customer.collector_id, customer.branch_id, 'Re-Loan', amount, 15, period, date_released, amortization, 'reloan_pending', remarks || 'Auto-created via Re-Loan application', req.user.id]
    );
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RELOAN_APP', 'CUSTOMER', customer.id, `Re-Loan application created: ${loan_code} for ₱${amount}`]);
    res.json({ message: 'Re-Loan application submitted successfully', loan_code });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/:id/reci', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const lCount = (await dbGet('SELECT COUNT(*) as c FROM tblLoan')).c;
    const loan_code = `LN-${String(lCount + 1).padStart(6, '0')}`;
    const date_released = new Date().toISOString().split('T')[0];
    
    await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, loan_period, date_released, amortization, status, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, customer.id, customer.collector_id, customer.branch_id, 'Re-CI', 0, 15, 45, date_released, 0, 'pending', 'Auto-created via Re-CI action', req.user.id]
    );
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RECI', 'CUSTOMER', customer.id, `Re-CI application created: ${loan_code}`]);
    res.json({ message: 'Re-CI application created successfully', loan_code });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/:id/status', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    await dbRun(`UPDATE tblCustomer SET status=?, updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
    await dbRun(`INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks) VALUES (?, ?, ?, ?, ?)`, 
      [req.params.id, customer.status, status, req.user.id, remarks || `Manually changed to ${status}`]);
    
    res.json({ message: `Customer status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
