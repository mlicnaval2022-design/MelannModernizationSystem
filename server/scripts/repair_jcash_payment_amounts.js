const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'melann.db');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${dbPath}.before-payment-amount-repair-${stamp}.bak`;

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

fs.copyFileSync(dbPath, backupPath);

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

async function main() {
  await run('PRAGMA foreign_keys=ON');
  await run('PRAGMA busy_timeout=10000');

  const before = await get(`
    SELECT COUNT(1) AS mismatches
    FROM tblPayment
    WHERE status = 'active'
      AND balance_before IS NOT NULL
      AND balance_after IS NOT NULL
      AND ROUND(balance_before - balance_after, 2) >= 0
      AND ROUND(balance_before - balance_after, 2) != ROUND(amount_paid, 2)
  `);

  try {
    let paymentRowsUpdated = 0;
    for (;;) {
      const batch = await all(`
        SELECT id
        FROM tblPayment
        WHERE status = 'active'
          AND balance_before IS NOT NULL
          AND balance_after IS NOT NULL
          AND ROUND(balance_before - balance_after, 2) >= 0
          AND ROUND(balance_before - balance_after, 2) != ROUND(amount_paid, 2)
        LIMIT 5000
      `);
      if (batch.length === 0) break;

      await run('BEGIN IMMEDIATE');
      const placeholders = batch.map(() => '?').join(',');
      const updated = await run(
        `UPDATE tblPayment
         SET amount_paid = ROUND(balance_before - balance_after, 2)
         WHERE id IN (${placeholders})`,
        batch.map(row => row.id)
      );
      await run('COMMIT');
      paymentRowsUpdated += updated.changes;
      console.log(`Updated payment rows: ${paymentRowsUpdated}/${before.mismatches}`);
    }

    const after = await get(`
      SELECT COUNT(1) AS mismatches
      FROM tblPayment
      WHERE status = 'active'
        AND balance_before IS NOT NULL
        AND balance_after IS NOT NULL
        AND ROUND(balance_before - balance_after, 2) >= 0
        AND ROUND(balance_before - balance_after, 2) != ROUND(amount_paid, 2)
    `);

    console.log(JSON.stringify({
      backupPath,
      paymentMismatchesBefore: before.mismatches,
      paymentRowsUpdated,
      paymentMismatchesAfter: after.mismatches,
    }, null, 2));
  } catch (err) {
    await run('ROLLBACK').catch(() => {});
    throw err;
  }
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
