const { dbRun } = require('../db/database');

/**
 * Writes an entry to tblLogtime.
 * Safe to call fire-and-forget (does not throw).
 */
async function audit(req, action, module, referenceId, details) {
  try {
    const userId = req?.user?.id || null;
    const username = req?.user?.username || 'system';
    const ip = req?.ip || req?.connection?.remoteAddress || null;
    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details, ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [userId, username, action, module, referenceId || null, details || null, ip]
    );
  } catch (err) {
    // Never let logging crash the main flow
    console.error('Audit log error:', err.message);
  }
}

module.exports = { audit };
