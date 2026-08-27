const { dbRun, dbGet } = require('../db/database');

/**
 * Marks active loans as 'pastdue' when date_maturity has passed.
 * Also marks pastdue loans as 'active' if somehow date_maturity is in future (data fix).
 * Runs once on startup and every 60 minutes.
 */
async function runPastDueUpdate() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Mark overdue active loans as pastdue
    // EXCLUDE legacy imported loans since their maturity dates are very old
    const r1 = await dbRun(
      `UPDATE tblLoan SET status='pastdue', updated_at=datetime('now')
       WHERE status='active' AND date_maturity < ? AND remarks NOT LIKE 'Imported%'`,
      [today]
    );
    if (r1.changes > 0) {
      console.log(`⚠️  Past-due updater: marked ${r1.changes} loan(s) as pastdue`);
    }

    console.log(`✅ Past-due check complete (${today})`);
  } catch (err) {
    console.error('Past-due updater error:', err.message);
  }
}

function startPastDueScheduler() {
  // Run immediately on startup
  runPastDueUpdate();
  // Then every 60 minutes
  setInterval(runPastDueUpdate, 60 * 60 * 1000);
}

module.exports = { startPastDueScheduler, runPastDueUpdate };
