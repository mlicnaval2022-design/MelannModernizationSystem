const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { DB_PATH, closeDb, initializeDatabase } = require('../src/db/database');
const { clearInitialAdminPassword } = require('./clearInitialAdminPassword');

async function initializeFreshDatabase() {
  await initializeDatabase();
  await closeDb();
  clearInitialAdminPassword();
  console.log(`Fresh branch database is ready: ${DB_PATH}`);
}

initializeFreshDatabase().catch(async (error) => {
  await closeDb().catch(() => {});
  console.error(`Fresh database initialization failed: ${error.message}`);
  process.exit(1);
});
