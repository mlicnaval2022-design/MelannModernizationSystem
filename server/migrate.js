const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, './melann.db'));

const columns = [
  'sitio TEXT',
  'purok TEXT',
  'brgy TEXT',
  'city TEXT',
  'gender TEXT',
  'secondary_contact TEXT',
  'email TEXT',
  'income_per_month REAL',
  'expenses_per_month REAL',
  'loan_purpose TEXT',
  'collateral TEXT',
  'id_type TEXT',
  'id_number TEXT',
  'id_issue_date TEXT',
  'id_expiry_date TEXT',
  'id_issued_by TEXT',
  'fb_account TEXT',
  'nationality TEXT'
];

db.serialize(() => {
  for (let col of columns) {
    db.run(`ALTER TABLE tblCustomer ADD COLUMN ${col}`, (err) => {
      if (err) {
        if (err.message.includes('duplicate column')) {
          console.log(`Column already exists: ${col}`);
        } else {
          console.error(`Error adding ${col}:`, err.message);
        }
      } else {
        console.log(`Added column: ${col}`);
      }
    });
  }
});
