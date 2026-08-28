const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(__dirname, '../.env');

function clearInitialAdminPassword() {
  if (!fs.existsSync(envPath)) return false;
  const original = fs.readFileSync(envPath, 'utf8');
  const lines = original.split(/\r?\n/);
  const filtered = lines.filter(line => !/^INITIAL_ADMIN_PASSWORD=/.test(line));
  if (filtered.length === lines.length) return false;
  fs.writeFileSync(envPath, filtered.join('\r\n').replace(/(?:\r\n)*$/, '\r\n'), 'utf8');
  return true;
}

if (require.main === module) {
  const changed = clearInitialAdminPassword();
  console.log(changed
    ? 'INITIAL_ADMIN_PASSWORD removed from server/.env.'
    : 'No INITIAL_ADMIN_PASSWORD remained in server/.env.');
}

module.exports = { clearInitialAdminPassword };
