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

router.post('/:id/reloan', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const lCount = (await dbGet('SELECT COUNT(*) as c FROM tblLoan')).c;
    const loan_code = `LN-${String(lCount + 1).padStart(6, '0')}`;
    const date_released = new Date().toISOString().split('T')[0];
    
    await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, loan_period, date_released, amortization, status, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, customer.id, customer.collector_id, customer.branch_id, 'Re-Loan', 0, 15, 45, date_released, 0, 'for_approval', 'Auto-created via Re-Loan action', req.user.id]
    );
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RELOAN', 'CUSTOMER', customer.id, `Re-Loan application created: ${loan_code}`]);
    res.json({ message: 'Re-Loan application created successfully', loan_code });
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

module.exports = router;
