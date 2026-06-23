const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'melann.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database', err);
    process.exit(1);
  }
});

db.serialize(() => {
  console.log('Starting DCR Database Migration...');

  db.run(`
    CREATE TABLE IF NOT EXISTS tblDailyCashReport (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dcr_number TEXT UNIQUE NOT NULL,
      branch_id INTEGER,
      report_date TEXT NOT NULL,
      beginning_cash REAL DEFAULT 0,
      total_collections REAL DEFAULT 0,
      total_releases REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      other_income REAL DEFAULT 0,
      other_disbursements REAL DEFAULT 0,
      expected_ending_cash REAL DEFAULT 0,
      count_1000 INTEGER DEFAULT 0,
      count_500 INTEGER DEFAULT 0,
      count_200 INTEGER DEFAULT 0,
      count_100 INTEGER DEFAULT 0,
      count_50 INTEGER DEFAULT 0,
      count_20 INTEGER DEFAULT 0,
      count_coins REAL DEFAULT 0,
      actual_cash_count REAL DEFAULT 0,
      variance REAL DEFAULT 0,
      status TEXT DEFAULT 'CLOSED',
      closed_by INTEGER,
      closed_at TEXT DEFAULT (datetime('now')),
      remarks TEXT
    );
  `, (err) => {
    if (err) console.error('Error creating tblDailyCashReport:', err.message);
    else console.log('tblDailyCashReport created or already exists.');
  });

  const alterTable = (tableName, columnName, columnDef) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) return console.error(`Error checking ${tableName}:`, err.message);
      
      const exists = columns.some(c => c.name === columnName);
      if (!exists) {
        db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`, (err) => {
          if (err) console.error(`Error adding ${columnName} to ${tableName}:`, err.message);
          else console.log(`Added ${columnName} to ${tableName}.`);
        });
      } else {
        console.log(`Column ${columnName} already exists in ${tableName}.`);
      }
    });
  };

  alterTable('tblPayment', 'dcr_id', 'INTEGER');
  alterTable('tblLoan', 'dcr_id', 'INTEGER');
  alterTable('tblExpense', 'dcr_id', 'INTEGER');
  
  // Also add it to database.js so future setups include it
});
