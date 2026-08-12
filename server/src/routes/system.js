const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { dbRun } = require('../db/database');
const { createDatabaseBackup } = require('../services/databaseBackup');

const router = express.Router();

router.post('/backup', authenticateToken, async (req, res) => {
  try {
    const result = await createDatabaseBackup({ requestedBy: req.user?.username });

    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, details) VALUES (?,?,?,?,?)`,
      [
        req.user?.id || null,
        req.user?.username || null,
        'BACKUP',
        'SYSTEM',
        `Database backup created: ${result.dbBackupPath}`
      ]
    );

    res.json({
      message: 'Backup completed successfully',
      backup_dir: result.backupDir,
      database_backup: result.dbBackupPath,
      manifest: result.manifestPath,
      uploads_backup: result.uploadsBackupPath,
      size_bytes: result.sizeBytes
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Backup failed' });
  }
});

module.exports = router;
