const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(projectRoot, 'release-packages');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
const packageName = `Melann_Lending_System_Blank_Branch_${stamp}`;
const stagingRoot = path.join(releaseRoot, packageName);
const zipPath = path.join(releaseRoot, `${packageName}.zip`);

const excludedDirectoryNames = new Set([
  '.git', '.npm-cache', '.runtime', 'node_modules', 'dist', 'build',
  'uploads', 'backups', 'certs', 'release-packages',
  'MLS_CLIENT_INSTALLER_WITH_ICON',
]);
const excludedFileNames = new Set([
  '.env', 'INITIAL_ADMIN_CREDENTIALS.txt', 'MLS_SERVER_CERT.cer',
  'MLS_CLIENT_INSTALLER_WITH_ICON.zip', 'INSTALL_MLS_CLIENT_192.168.1.12.bat',
]);
const excludedExtensions = new Set([
  '.db', '.sqlite', '.bak', '.pfx', '.pem', '.key', '.log', '.zip',
]);

function shouldExclude(sourcePath, entry) {
  if (entry.isDirectory()) return excludedDirectoryNames.has(entry.name);
  if (excludedFileNames.has(entry.name)) return true;
  const lowerName = entry.name.toLowerCase();
  if (lowerName.endsWith('.db-wal') || lowerName.endsWith('.db-shm') || lowerName.endsWith('.sqlite-wal') || lowerName.endsWith('.sqlite-shm')) return true;
  return excludedExtensions.has(path.extname(lowerName));
}

function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (shouldExclude(source, entry)) continue;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, destinationPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, destinationPath);
  }
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

fs.mkdirSync(releaseRoot, { recursive: true });
if (!stagingRoot.startsWith(`${releaseRoot}${path.sep}`)) throw new Error('Unsafe staging path.');
fs.rmSync(stagingRoot, { recursive: true, force: true });
copyTree(projectRoot, stagingRoot);

const files = listFiles(stagingRoot);
const forbidden = files.filter(filePath => {
  const relative = path.relative(stagingRoot, filePath).replace(/\\/g, '/').toLowerCase();
  const base = path.basename(relative);
  return base === '.env'
    || base === 'initial_admin_credentials.txt'
    || base === 'mls_server_cert.cer'
    || /\.(db|sqlite|bak|pfx|pem|key)(-|$|\.)/.test(base)
    || relative.includes('/uploads/')
    || relative.includes('/backups/')
    || relative.includes('/certs/');
});
if (forbidden.length) throw new Error(`Blank package contains forbidden data: ${forbidden.join(', ')}`);

const manifest = {
  package_name: packageName,
  created_at: new Date().toISOString(),
  purpose: 'Fresh branch deployment with application code and no company records or secrets.',
  database_included: false,
  uploads_included: false,
  environment_secrets_included: false,
  file_count: files.length,
  files: files.map(filePath => ({
    path: path.relative(stagingRoot, filePath).replace(/\\/g, '/'),
    sha256: sha256(filePath),
  })),
};
fs.writeFileSync(path.join(stagingRoot, 'BLANK_PACKAGE_MANIFEST.json'), JSON.stringify(manifest, null, 2));

fs.rmSync(zipPath, { force: true });
const result = require('node:child_process').spawnSync('tar.exe', ['-a', '-c', '-f', zipPath, '-C', stagingRoot, '.'], {
  stdio: 'inherit',
});
if (result.status !== 0) {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  throw new Error('Unable to create the blank branch ZIP package.');
}

fs.rmSync(stagingRoot, { recursive: true, force: true });
console.log(`Blank branch package created: ${zipPath}`);
