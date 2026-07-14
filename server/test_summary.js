const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const rows = [
  { agency: 'CIC', status: 'Pending', due_date: '2026-07-20' },
  { agency: 'BIR', status: 'Paid', due_date: '2026-07-15' }
];

const completed = ['Accepted', 'Approved', 'Completed', 'Paid'].includes.bind(['Accepted', 'Approved', 'Completed', 'Paid']);

console.log("Completed:", completed('Paid'));
console.log("Not Completed:", completed('Pending'));

const today = new Date();
const overdue = rows.filter(r => new Date(`${r.due_date}T23:59:59`) < today && !completed(r.status));
console.log("Overdue:", overdue);

db.close();
