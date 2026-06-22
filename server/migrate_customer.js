const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');
db.serialize(() => {
  const fields = [
    'home_status TEXT',
    'business_address TEXT',
    'business_location TEXT',
    'business_years INTEGER DEFAULT 0',
    'business_months INTEGER DEFAULT 0',
    'business_ownership TEXT',
    'business_permit TEXT'
  ];
  fields.forEach(f => {
    db.run(`ALTER TABLE tblCustomer ADD COLUMN ${f}`, (err) => {
      if (err) console.log('Already exists or error:', err.message);
      else console.log('Added:', f);
    });
  });
});
