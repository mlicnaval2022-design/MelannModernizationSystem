const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(DB_PATH);

const columnsToAdd = [
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
  console.log('Starting migration...');
  
  // 1. Add columns to tblCustomer (ignore if exists)
  columnsToAdd.forEach(col => {
    const colName = col.split(' ')[0];
    db.run(`ALTER TABLE tblCustomer ADD COLUMN ${col}`, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log(`Column ${colName} already exists.`);
        } else {
          console.error(`Error adding ${colName}:`, err.message);
        }
      } else {
        console.log(`Added column ${colName}`);
      }
    });
  });

  // 2. Truncate and seed tblCollector
  db.run(`DELETE FROM tblCollector`, (err) => {
    if (err) console.error("Error clearing tblCollector:", err.message);
    else console.log("Cleared tblCollector");
  });
  
  // Also reset sqlite sequence for tblCollector to ensure IDs map 1 to 1
  db.run(`DELETE FROM sqlite_sequence WHERE name='tblCollector'`, (err) => {
     if (err) console.error("Error resetting sequence:", err.message);
  });

  const collectors = [
    { id: 1, name: 'Rosal, Aldie', code: '1' },
    { id: 2, name: 'Pastdue, Noel Jugar', code: '2' },
    { id: 3, name: 'Torreta, Angelito', code: '3' },
    { id: 4, name: 'Jugar, Noel', code: '4' },
    { id: 5, name: 'Pastdue, Eddie Caballes', code: '5' },
    { id: 6, name: 'Caballes, Eddie', code: '6' },
    { id: 7, name: 'Domingono, Renato', code: '7' },
    { id: 8, name: 'Laude, Reynaldo', code: '8' },
    { id: 9, name: 'Melann Office', code: '9' },
    { id: 10, name: 'Pastdue, Aldie Rosal', code: '10' },
    { id: 11, name: 'Pastdue, Angelito Torreta', code: '11' },
    { id: 12, name: 'Pastdue, Renato Domingono', code: '12' }
  ];

  const stmt = db.prepare(`INSERT INTO tblCollector (id, collector_code, first_name, last_name, branch_id) VALUES (?, ?, ?, ?, ?)`);
  
  collectors.forEach(c => {
    const nameParts = c.name.split(',');
    const lastName = nameParts[0].trim();
    const firstName = nameParts.length > 1 ? nameParts[1].trim() : '';
    stmt.run(c.id, c.code, firstName, lastName, 1, (err) => {
      if (err) console.error(`Error inserting collector ${c.name}:`, err.message);
    });
  });

  stmt.finalize(() => {
    console.log('Seeded tblCollector with exactly 12 specific collectors.');
    db.close();
  });
});
