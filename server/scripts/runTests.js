const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');

const requestedArguments = process.argv.slice(2);
const nodeTestOptions = requestedArguments.filter(argument => argument.startsWith('--'));
const patterns = requestedArguments.filter(argument => !argument.startsWith('--'));
if (patterns.length === 0) {
  console.error('At least one test file pattern is required.');
  process.exit(2);
}

const isolatedRoot = mkdtempSync(join(tmpdir(), 'melann-tests-'));
const uploadsPath = join(isolatedRoot, 'uploads');
const backupPath = join(isolatedRoot, 'backups');

const child = spawn(process.execPath, [
  '--test',
  '--test-concurrency=1',
  ...nodeTestOptions,
  ...patterns,
], {
  cwd: join(__dirname, '..'),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    UPLOADS_PATH: uploadsPath,
    BACKUP_PATH: backupPath,
  },
  stdio: 'inherit',
});

function cleanup() {
  try {
    rmSync(isolatedRoot, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Test cleanup warning: ${error.message}`);
  }
}

child.on('error', (error) => {
  cleanup();
  console.error(`Unable to start tests: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  cleanup();
  if (signal) {
    console.error(`Tests stopped by signal ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
