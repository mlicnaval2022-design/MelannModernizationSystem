const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

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
      home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit
    } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    const count = (await dbGet('SELECT COUNT(*) as c FROM tblCustomer')).c;
    const customer_code = String(count + 1).padStart(4, '0');
    const result = await dbRun(`INSERT INTO tblCustomer (customer_code, first_name, last_name, middle_name, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status, sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?)`, 
      [customer_code, first_name, last_name, middle_name || null, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, 
       sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'CREATE', 'CUSTOMER', result.lastID, `Created: ${full_name}`]);
    res.status(201).json({ id: result.lastID, customer_code, full_name });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, middle_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status,
      sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, 
      loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality,
      home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit
    } = req.body;
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    await dbRun(`UPDATE tblCustomer SET first_name=?, last_name=?, middle_name=?, full_name=?, address=?, contact=?, birth_date=?, civil_status=?, occupation=?, branch_id=?, collector_id=?, status=?, sitio=?, purok=?, brgy=?, city=?, gender=?, secondary_contact=?, email=?, income_per_month=?, expenses_per_month=?, loan_purpose=?, collateral=?, id_type=?, id_number=?, id_issue_date=?, id_expiry_date=?, id_issued_by=?, fb_account=?, nationality=?, home_status=?, business_address=?, business_location=?, business_years=?, business_months=?, business_ownership=?, business_permit=?, updated_at=datetime('now') WHERE id=?`, 
      [first_name, last_name, middle_name, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status || 'active', 
       sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit, req.params.id]);
    res.json({ message: 'Customer updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    await dbRun(`UPDATE tblCustomer SET status='inactive', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    res.json({ message: 'Customer deactivated' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
