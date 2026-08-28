const fs = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const customerCode = process.argv[2];
const expectedName = process.argv[3];

if (!customerCode || !expectedName) {
  console.error('Usage: node scripts/removeSampleCustomer.js <customer-code> <expected-full-name>');
  process.exit(1);
}

const databasePath = path.resolve(__dirname, '..', 'melann.db');
const uploadsRoot = path.resolve(__dirname, '..', '..', 'uploads');
const db = new sqlite3.Database(databasePath);

function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(error) {
    if (error) reject(error);
    else resolve(this.changes);
  }));
}

async function main() {
  const [customer] = await all('SELECT * FROM tblCustomer WHERE customer_code = ?', [customerCode]);
  if (!customer) throw new Error(`Customer code ${customerCode} was not found; no data was changed.`);
  if (customer.full_name !== expectedName) {
    throw new Error(`Customer identity mismatch for code ${customerCode}; no data was changed.`);
  }

  const loans = await all('SELECT id FROM tblLoan WHERE customer_id = ?', [customer.id]);
  const loanIds = loans.map(({ id }) => id);
  const tableRows = await all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  const deleted = {};

  await run('BEGIN IMMEDIATE');
  try {
    for (const { name } of tableRows) {
      if (name === 'tblCustomer' || name === 'tblLoan') continue;
      const columns = await all(`PRAGMA table_info("${name.replace(/"/g, '""')}")`);
      const names = new Set(columns.map(({ name: columnName }) => columnName));
      let count = 0;
      if (loanIds.length && names.has('loan_id')) {
        count += await run(`DELETE FROM "${name.replace(/"/g, '""')}" WHERE loan_id IN (${loanIds.map(() => '?').join(', ')})`, loanIds);
      }
      if (names.has('customer_id')) {
        count += await run(`DELETE FROM "${name.replace(/"/g, '""')}" WHERE customer_id = ?`, [customer.id]);
      }
      if (count) deleted[name] = count;
    }

    const loanCount = await run('DELETE FROM tblLoan WHERE customer_id = ?', [customer.id]);
    if (loanCount) deleted.tblLoan = loanCount;
    const customerCount = await run('DELETE FROM tblCustomer WHERE id = ? AND customer_code = ?', [customer.id, customerCode]);
    if (customerCount !== 1) throw new Error('Customer deletion did not complete.');
    deleted.tblCustomer = customerCount;
    await run('COMMIT');
  } catch (error) {
    try { await run('ROLLBACK'); } catch { /* no-op */ }
    throw error;
  }

  const removedFiles = [];
  for (const value of Object.values(customer)) {
    if (typeof value !== 'string' || !value.startsWith('/uploads/')) continue;
    const target = path.resolve(uploadsRoot, value.slice('/uploads/'.length));
    if (!target.startsWith(`${uploadsRoot}${path.sep}`)) continue;
    try {
      await fs.unlink(target);
      removedFiles.push(path.basename(target));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const remaining = await all('SELECT id FROM tblCustomer WHERE customer_code = ?', [customerCode]);
  const foreignKeyViolations = await all('PRAGMA foreign_key_check');
  console.log(JSON.stringify({ deleted, removedFiles, remainingCustomerRecords: remaining.length, foreignKeyViolations: foreignKeyViolations.length }));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
