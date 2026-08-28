const { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const serverRoot = join(__dirname, '..');
const backupRoot = resolve(serverRoot, process.env.BACKUP_PATH || './backups');

function findDatabaseBackups(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return findDatabaseBackups(fullPath);
    return entry.isFile() && entry.name.endsWith('.db') ? [fullPath] : [];
  });
}

const requestedPath = process.argv[2] ? resolve(process.argv[2]) : null;
const sourcePath = requestedPath || findDatabaseBackups(backupRoot)
  .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0];

if (!sourcePath || !existsSync(sourcePath)) {
  console.error('Backup restore rehearsal failed: no database backup was found.');
  process.exit(1);
}

const rehearsalDir = mkdtempSync(join(tmpdir(), 'melann-restore-rehearsal-'));
const restoredPath = join(rehearsalDir, 'restored-melann.db');

try {
  cpSync(sourcePath, restoredPath);
  const result = spawnSync(process.execPath, [join(__dirname, 'verifyDatabase.js')], {
    cwd: serverRoot,
    env: { ...process.env, DB_PATH: restoredPath },
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
  console.log(`Backup restore rehearsal passed: ${sourcePath}`);
} finally {
  rmSync(rehearsalDir, { recursive: true, force: true });
}
