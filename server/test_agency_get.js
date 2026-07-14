const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const agency = 'CIC';
const month = '';
const year = 2026;
const status = '';
const filing_type = '';
const tax_type = '';
const search = '';
const page = 1;
const limit = 10;
const sort = 'due_date';
const dir = 'ASC';
const allowedSort = ['due_date', 'status', 'date_submitted', 'date_filed', 'date_paid', 'created_at', 'compliance_name', 'filing_type', 'tax_type'];

let q = `SELECT * FROM tblGovernmentCompliance WHERE agency = ? AND is_archived = 0`;
const p = [agency];

if (month) { q += ` AND (submission_month = ? OR strftime('%m', due_date) = ?)`; p.push(month, String(month).padStart(2, '0')); }
if (year) { q += ` AND strftime('%Y', due_date) = ?`; p.push(String(year)); }
if (status) { q += ` AND status = ?`; p.push(status); }
if (filing_type) { q += ` AND filing_type = ?`; p.push(filing_type); }
if (tax_type) { q += ` AND tax_type = ?`; p.push(tax_type); }
if (search) {
  q += ` AND (title LIKE ? OR compliance_name LIKE ? OR filing_type LIKE ? OR tax_type LIKE ? OR remarks LIKE ?)`;
  p.push(...Array(5).fill(`%${search}%`));
}

db.get(`SELECT COUNT(*) as count FROM (${q})`, p, (err, count) => {
  if (err) {
    console.error("COUNT ERROR:", err.message);
    db.close();
    return;
  }
  console.log("Count:", count);
  q += ` ORDER BY ${allowedSort.includes(sort) ? sort : 'due_date'} ${String(dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`;
  p.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  
  db.all(q, p, (err, rows) => {
    if (err) console.error("SELECT ERROR:", err.message);
    else console.log("Rows:", rows.length);
    db.close();
  });
});
