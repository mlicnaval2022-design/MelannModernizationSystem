const path = require('path');
const sqlite3 = require('sqlite3');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const serverRoot = path.join(__dirname, '..');
const configuredPath = process.env.DB_PATH || './melann.db';
const databasePath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(serverRoot, configuredPath);
const requiredTables = ['tblUser', 'tblCustomer', 'tblLoan', 'tblPayment', 'tblBranch'];

function all(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

async function verify() {
  const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
  try {
    const integrityRows = await all(db, 'PRAGMA integrity_check');
    const integrityMessages = integrityRows.map(row => Object.values(row)[0]);
    if (integrityMessages.length !== 1 || integrityMessages[0] !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${integrityMessages.join('; ')}`);
    }

    const foreignKeyRows = await all(db, 'PRAGMA foreign_key_check');
    if (foreignKeyRows.length > 0) {
      throw new Error(`Foreign-key check found ${foreignKeyRows.length} violation(s)`);
    }

    const tableRows = await all(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
    const tableNames = new Set(tableRows.map(row => row.name));
    const missingTables = requiredTables.filter(name => !tableNames.has(name));
    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }

    console.log(`Database verification passed: ${path.basename(databasePath)} (${tableRows.length} tables)`);
  } finally {
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  }
}

verify().catch(error => {
  console.error(`Database verification failed: ${error.message}`);
  process.exit(1);
});
