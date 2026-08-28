const fs = require('node:fs');
const path = require('node:path');

const SERVER_ROOT = path.join(__dirname, '../..');

function isProductionHttpsRequired() {
  return process.env.NODE_ENV === 'production' && process.env.ENFORCE_HTTPS !== 'false';
}

function resolveServerPath(value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(SERVER_ROOT, value);
}

function loadTlsOptions() {
  if (process.env.NODE_ENV !== 'production' && process.env.TLS_ENABLED !== 'true') return null;
  const pfxPath = resolveServerPath(process.env.TLS_PFX_PATH);
  if (!pfxPath) return null;
  if (!fs.existsSync(pfxPath)) {
    throw new Error(`TLS certificate bundle not found: ${pfxPath}`);
  }

  return {
    pfx: fs.readFileSync(pfxPath),
    passphrase: process.env.TLS_PFX_PASSPHRASE || undefined,
    minVersion: 'TLSv1.2',
  };
}

function validateProductionTransport() {
  if (!isProductionHttpsRequired()) return;
  if (process.env.TLS_PFX_PATH) return;

  const trustProxy = String(process.env.TRUST_PROXY || '0').trim();
  if (trustProxy === '0' || trustProxy.toLowerCase() === 'false') {
    throw new Error(
      'Production HTTPS requires TLS_PFX_PATH for direct LAN hosting, or a trusted HTTPS reverse proxy.'
    );
  }
}

module.exports = {
  isProductionHttpsRequired,
  loadTlsOptions,
  resolveServerPath,
  validateProductionTransport,
};
