const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { audit } = require('../services/auditLogger');

const router = express.Router();
const uploadDir = path.join(__dirname, '../../../uploads/compliance');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({ storage });

const AGENCIES = ['CIC', 'SEC', 'BIR'];

function requireAgencyAccess(req, res, next) {
  const agency = String(req.params.agency || req.body.agency || req.query.agency || '').toUpperCase();
  if (!AGENCIES.includes(agency)) return res.status(400).json({ error: 'Invalid agency' });
  req.agency = agency;
  next();
}

function parseDetails(previousValue, newValue) {
  return JSON.stringify({ previousValue, newValue });
}

async function withAttachments(row) {
  const attachments = await dbAll(
    `SELECT * FROM tblGovernmentComplianceAttachment WHERE compliance_id = ? AND is_active = 1 ORDER BY uploaded_at DESC`,
    [row.id]
  );
  return { ...row, attachments };
}

router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const agencies = AGENCIES;
    const placeholders = agencies.map(() => '?').join(',');
    const rows = await dbAll(
      `SELECT agency, status, due_date FROM tblGovernmentCompliance WHERE is_archived = 0 AND agency IN (${placeholders})`,
      agencies
    );
    const today = new Date();
    const month = today.getMonth();
    const year = today.getFullYear();
    const completed = ['Accepted', 'Approved', 'Completed', 'Paid'].includes.bind(['Accepted', 'Approved', 'Completed', 'Paid']);
    const cards = {
      cic: rows.filter(r => r.agency === 'CIC').length,
      sec: rows.filter(r => r.agency === 'SEC').length,
      bir: rows.filter(r => r.agency === 'BIR').length,
      dueThisMonth: rows.filter(r => {
        const d = new Date(`${r.due_date}T00:00:00`);
        return d.getMonth() === month && d.getFullYear() === year;
      }).length,
      overdue: rows.filter(r => new Date(`${r.due_date}T23:59:59`) < today && !completed(r.status)).length,
      completed: rows.filter(r => completed(r.status)).length
    };
    const notifyDays = new Set([30, 15, 7, 1]);
    const notifications = rows
      .map(r => {
        const due = new Date(`${r.due_date}T00:00:00`);
        const days = Math.ceil((due - new Date(today.toDateString())) / 86400000);
        if (days < 0 && !completed(r.status)) return { id: `${r.agency}-${r.due_date}-${r.status}`, agency: r.agency, title: 'Overdue filing', message: `${r.agency} compliance due ${r.due_date} is overdue.`, severity: 'danger' };
        if (notifyDays.has(days) && !completed(r.status)) return { id: `${r.agency}-${r.due_date}-${days}`, agency: r.agency, title: days === 1 ? 'Due tomorrow' : `Due in ${days} days`, message: `${r.agency} compliance is due on ${r.due_date}.`, severity: days <= 7 ? 'warning' : 'info' };
        return null;
      })
      .filter(Boolean)
      .slice(0, 20);
    res.json({ cards, notifications });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/client-reports/:agency', authenticateToken, requireAgencyAccess, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let q = `SELECT gcc.*,
              COALESCE(l.principal, gcc.loan_amount, 0) as principal_loan,
              COALESCE(l.interest_amount, 0) as interest_amount,
              COALESCE(l.total_amortization, COALESCE(l.principal, gcc.loan_amount, 0) + COALESCE(l.interest_amount, 0), gcc.loan_amount, 0) as total_loan
       FROM tblGovernmentComplianceClients gcc
       LEFT JOIN tblLoan l ON l.id = gcc.loan_id
       WHERE gcc.agency = ?
         AND gcc.assigned_user_id = ?`;
    const p = [req.agency, req.user.id];
    if (startDate) {
      q += ` AND (DATE(gcc.created_at) >= ? OR gcc.release_date >= ?)`;
      p.push(startDate, startDate);
    }
    if (endDate) {
      q += ` AND (DATE(gcc.created_at) <= ? OR gcc.release_date <= ?)`;
      p.push(endDate, endDate);
    }
    q += ` ORDER BY gcc.created_at DESC`;
    const rows = await dbAll(q, p);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/send-clients', authenticateToken, async (req, res) => {
  try {
    const { clients, agency } = req.body;
    const targetAgency = String(agency).toUpperCase();
    if (!clients || !targetAgency || !AGENCIES.includes(targetAgency)) return res.status(400).json({ error: 'Invalid request' });
    
    let inserted = 0;
    for (const c of clients) {
      const r = await dbRun(`
        INSERT OR IGNORE INTO tblGovernmentComplianceClients 
        (agency, loan_id, customer_id, customer_code, customer_name, loan_amount, loan_type, release_date, collector_name, branch_name, status, assigned_user_id, sent_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [targetAgency, c.loan_id, c.customer_id, c.customer_code, c.customer_name, c.loan_amount, c.loan_type, c.date_released, c.collector_name, c.branch_name, 'Sent', req.user.id, req.user.id]);
      if (r.changes > 0) inserted++;
    }
    
    res.json({ message: 'Success', inserted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:agency', authenticateToken, requireAgencyAccess, async (req, res) => {
  try {
    const { month, year, status, filing_type, tax_type, search, startDate, endDate, page = 1, limit = 10, sort = 'due_date', dir = 'ASC' } = req.query;
    const allowedSort = ['due_date', 'status', 'date_submitted', 'date_filed', 'date_paid', 'created_at', 'compliance_name', 'filing_type', 'tax_type'];
    let q = `SELECT * FROM tblGovernmentCompliance WHERE agency = ? AND is_archived = 0`;
    const p = [req.agency];
    if (startDate) {
      q += ` AND (due_date >= ? OR date_filed >= ? OR date_paid >= ?)`;
      p.push(startDate, startDate, startDate);
    }
    if (endDate) {
      q += ` AND (due_date <= ? OR date_filed <= ? OR date_paid <= ?)`;
      p.push(endDate, endDate, endDate);
    }
    if (month) { q += ` AND (submission_month = ? OR strftime('%m', due_date) = ?)`; p.push(month, String(month).padStart(2, '0')); }
    if (year) { q += ` AND strftime('%Y', due_date) = ?`; p.push(String(year)); }
    if (status) { q += ` AND status = ?`; p.push(status); }
    if (filing_type) { q += ` AND filing_type = ?`; p.push(filing_type); }
    if (tax_type) { q += ` AND tax_type = ?`; p.push(tax_type); }
    if (search) {
      q += ` AND (title LIKE ? OR compliance_name LIKE ? OR filing_type LIKE ? OR tax_type LIKE ? OR remarks LIKE ?)`;
      p.push(...Array(5).fill(`%${search}%`));
    }
    const count = await dbGet(`SELECT COUNT(*) as count FROM (${q})`, p);
    q += ` ORDER BY ${allowedSort.includes(sort) ? sort : 'due_date'} ${String(dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`;
    p.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const rows = await dbAll(q, p);
    const data = await Promise.all(rows.map(withAttachments));
    res.json({ data, total: count.count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:agency', authenticateToken, requireAgencyAccess, async (req, res) => {
  try {
    const b = req.body;
    const result = await dbRun(
      `INSERT INTO tblGovernmentCompliance
       (agency, title, submission_month, reporting_period, compliance_name, filing_type, tax_type, filing_period, due_date, date_submitted, date_filed, date_paid, or_number, amount, status, remarks, prepared_by, verified_by, assigned_personnel, created_by, updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.agency, b.title || null, b.submission_month || null, b.reporting_period || null, b.compliance_name || null, b.filing_type || null, b.tax_type || null, b.filing_period || null, b.due_date, b.date_submitted || null, b.date_filed || null, b.date_paid || null, b.or_number || null, b.amount || 0, b.status, b.remarks || null, b.prepared_by || null, b.verified_by || null, b.assigned_personnel || null, req.user.id, req.user.id]
    );
    await audit(req, 'CREATE', 'Government Compliance', result.lastID, parseDetails(null, { agency: req.agency, ...b }));
    res.status(201).json({ id: result.lastID });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:agency/:id', authenticateToken, requireAgencyAccess, async (req, res) => {
  try {
    const previous = await dbGet(`SELECT * FROM tblGovernmentCompliance WHERE id = ? AND agency = ?`, [req.params.id, req.agency]);
    if (!previous) return res.status(404).json({ error: 'Record not found' });
    const b = req.body;
    await dbRun(
      `UPDATE tblGovernmentCompliance SET title=?, submission_month=?, reporting_period=?, compliance_name=?, filing_type=?, tax_type=?, filing_period=?, due_date=?, date_submitted=?, date_filed=?, date_paid=?, or_number=?, amount=?, status=?, remarks=?, prepared_by=?, verified_by=?, assigned_personnel=?, updated_by=?, updated_at=datetime('now') WHERE id=? AND agency=?`,
      [b.title || null, b.submission_month || null, b.reporting_period || null, b.compliance_name || null, b.filing_type || null, b.tax_type || null, b.filing_period || null, b.due_date, b.date_submitted || null, b.date_filed || null, b.date_paid || null, b.or_number || null, b.amount || 0, b.status, b.remarks || null, b.prepared_by || null, b.verified_by || null, b.assigned_personnel || null, req.user.id, req.params.id, req.agency]
    );
    await audit(req, 'UPDATE', 'Government Compliance', req.params.id, parseDetails(previous, { agency: req.agency, ...b }));
    res.json({ message: 'Compliance record updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:agency/:id', authenticateToken, requireAgencyAccess, async (req, res) => {
  try {
    const previous = await dbGet(`SELECT * FROM tblGovernmentCompliance WHERE id = ? AND agency = ?`, [req.params.id, req.agency]);
    if (!previous) return res.status(404).json({ error: 'Record not found' });
    await dbRun(`UPDATE tblGovernmentCompliance SET is_archived = 1, updated_by = ?, updated_at = datetime('now') WHERE id = ?`, [req.user.id, req.params.id]);
    await audit(req, 'ARCHIVE', 'Government Compliance', req.params.id, parseDetails(previous, { ...previous, is_archived: 1 }));
    res.json({ message: 'Compliance record archived' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:agency/:id/attachments', authenticateToken, requireAgencyAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const record = await dbGet(`SELECT id FROM tblGovernmentCompliance WHERE id = ? AND agency = ?`, [req.params.id, req.agency]);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const documentType = req.body.document_type || 'Supporting Document';
    if (req.body.replace === 'true') {
      await dbRun(`UPDATE tblGovernmentComplianceAttachment SET is_active = 0 WHERE compliance_id = ? AND document_type = ?`, [req.params.id, documentType]);
    }
    const fileUrl = `/uploads/compliance/${req.file.filename}`;
    const result = await dbRun(
      `INSERT INTO tblGovernmentComplianceAttachment (compliance_id, document_type, original_name, stored_name, file_url, uploaded_by) VALUES (?,?,?,?,?,?)`,
      [req.params.id, documentType, req.file.originalname, req.file.filename, fileUrl, req.user.id]
    );
    await audit(req, req.body.replace === 'true' ? 'REPLACE_FILE' : 'UPLOAD_FILE', 'Government Compliance', req.params.id, parseDetails(null, { documentType, fileUrl }));
    res.status(201).json({ id: result.lastID, file_url: fileUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:agency/:id/history', authenticateToken, requireAgencyAccess, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT l.*, u.full_name as user_full_name FROM tblLogtime l LEFT JOIN tblUser u ON l.user_id = u.id WHERE l.module = 'Government Compliance' AND l.reference_id = ? ORDER BY l.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
