const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { DB_PATH, dbExec } = require('../db/database');

const SERVER_ROOT = path.join(__dirname, '../..');
const DEFAULT_BACKUP_ROOT = path.join(SERVER_ROOT, 'backups');
const UPLOADS_ROOT = process.env.UPLOADS_PATH
  ? path.resolve(SERVER_ROOT, process.env.UPLOADS_PATH)
  : path.join(SERVER_ROOT, '../uploads');

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  const millisecond = String(date.getMilliseconds()).padStart(3, '0');
  return {
    dateFolder: `${year}-${month}-${day}`,
    fileStamp: `${year}-${month}-${day}_${hour}-${minute}-${second}-${millisecond}_${randomUUID().slice(0, 8)}`
  };
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createDatabaseBackup({ requestedBy } = {}) {
  const backupRoot = process.env.BACKUP_PATH || DEFAULT_BACKUP_ROOT;
  const { dateFolder, fileStamp } = formatTimestamp();
  const backupDir = path.join(backupRoot, dateFolder);
  const dbBackupPath = path.join(backupDir, `melann-backup-${fileStamp}.db`);
  const uploadsBackupPath = path.join(backupDir, `uploads-${fileStamp}`);

  await fs.mkdir(backupDir, { recursive: true });
  await dbExec(`VACUUM main INTO ${sqlString(dbBackupPath)}`);

  let uploadsBackedUp = false;
  if (await pathExists(UPLOADS_ROOT)) {
    await fs.cp(UPLOADS_ROOT, uploadsBackupPath, { recursive: true });
    uploadsBackedUp = true;
  }

  const dbStat = await fs.stat(dbBackupPath);
  const manifest = {
    created_at: new Date().toISOString(),
    requested_by: requestedBy || null,
    database_source: DB_PATH,
    database_backup: dbBackupPath,
    database_size_bytes: dbStat.size,
    uploads_source: uploadsBackedUp ? UPLOADS_ROOT : null,
    uploads_backup: uploadsBackedUp ? uploadsBackupPath : null
  };

  const manifestPath = path.join(backupDir, `backup-${fileStamp}.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    backupDir,
    dbBackupPath,
    manifestPath,
    uploadsBackupPath: uploadsBackedUp ? uploadsBackupPath : null,
    sizeBytes: dbStat.size
  };
}

module.exports = { createDatabaseBackup };
