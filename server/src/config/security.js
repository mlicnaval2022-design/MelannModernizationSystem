const INSECURE_PRODUCTION_SECRETS = new Set([
  'melann_secret',
  'melann_lending_secret_key_2026',
]);

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new Error('JWT_SECRET is required. Set it in server/.env before starting the server.');
  }
  if (process.env.NODE_ENV === 'production' && (secret.length < 32 || INSECURE_PRODUCTION_SECRETS.has(secret))) {
    throw new Error('JWT_SECRET must be a unique production secret of at least 32 characters.');
  }
  return secret;
}

module.exports = { getJwtSecret };
