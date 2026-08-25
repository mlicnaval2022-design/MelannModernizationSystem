const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const loanRoutes = require('./routes/loans');
const paymentRoutes = require('./routes/payments');
const collectorRoutes = require('./routes/collectors');
const branchRoutes = require('./routes/branches');
const depositRoutes = require('./routes/deposits');
const transactionRoutes = require('./routes/transactions');
const reportRoutes = require('./routes/reports');
const cashRoutes = require('./routes/cash');
const reversalRoutes = require('./routes/reversals');
const auditRoutes = require('./routes/audit');
const dcrRoutes = require('./routes/dcr');
const governmentComplianceRoutes = require('./routes/governmentCompliance');
const cicRoutes = require('./routes/cic');
const monitoringRoutes = require('./routes/monitoring');
const promiseToPayRoutes = require('./routes/promiseToPay');
const settingsRoutes = require('./routes/settings');
const collectorPerformanceRoutes = require('./routes/collectorPerformance');
const fortyFiveDayRatingRoutes = require('./routes/fortyFiveDayRating');
const demandLetterRoutes = require('./routes/demandLetters');
const systemRoutes = require('./routes/system');
const jcashMigrationRoutes = require('./routes/jcashMigration');
const errorHandler = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');
const { authorizeModule } = require('./middleware/permissions');
const { REPORT_TYPE_PERMISSIONS } = require('./config/accessModules');

function createApp() {
  const app = express();
  const uploadsRoot = process.env.UPLOADS_PATH || path.join(__dirname, '../../uploads');
  const clientDistRoot = path.join(__dirname, '../../client/dist');
  if (process.env.NODE_ENV === 'production') {
    const trustProxy = process.env.TRUST_PROXY || '1';
    app.set('trust proxy', Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy));

    if (process.env.ENFORCE_HTTPS !== 'false') {
      app.use((req, res, next) => {
        if (req.secure) {
          return next();
        }

        if (req.path === '/api/health' && process.env.ALLOW_INSECURE_HEALTHCHECK === 'true') {
          return next();
        }

        return res.status(426).json({ error: 'HTTPS is required' });
      });
    }
  }
  const configuredOrigins = String(process.env.CORS_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
    throw new Error('CORS_ORIGINS is required in production. Provide the exact client origin(s).');
  }
  const developmentOrigins = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/192\.168\.\d+\.\d+:\d+$/];

  app.use(cors({
    origin(origin, callback) {
      const normalizedOrigin = String(origin || '').toLowerCase();
      const allowed = configuredOrigins.some(item => item.toLowerCase() === normalizedOrigin)
        || (process.env.NODE_ENV !== 'production' && developmentOrigins.some(pattern => pattern.test(origin)));
      if (!origin || allowed) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true
  }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (process.env.NODE_ENV === 'production' && req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use('/uploads', authenticateToken, express.static(uploadsRoot, {
    dotfiles: 'deny',
    fallthrough: false,
    index: false,
    setHeaders: res => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', authenticateToken, authorizeModule('user-management'), userRoutes);
  app.use('/api/customers', authenticateToken, authorizeModule('customers', 'credit-scoring'), customerRoutes);
  app.use('/api/loans', authenticateToken, authorizeModule('loans', 'credit-scoring', 'promissory-disclosure'), loanRoutes);
  app.use('/api/payments', authenticateToken, authorizeModule('payments'), paymentRoutes);
  app.use('/api/collectors', authenticateToken, authorizeModule('collectors'), collectorRoutes);
  app.use('/api/branches', authenticateToken, authorizeModule('branches'), branchRoutes);
  app.use('/api/deposits', authenticateToken, authorizeModule('deposits'), depositRoutes);
  app.use('/api/transactions', authenticateToken, authorizeModule('transactions'), transactionRoutes);
  app.use('/api/reports', authenticateToken, authorizeModule('reports', ...REPORT_TYPE_PERMISSIONS.map(item => item.key), 'promissory-disclosure', 'dashboard', 'credit-scoring', 'collector-performance'), reportRoutes);
  app.use('/api/cash', authenticateToken, authorizeModule('cash'), cashRoutes);
  app.use('/api/reversals', authenticateToken, authorizeModule('payments'), reversalRoutes);
  app.use('/api/audit', authenticateToken, authorizeModule('audit'), auditRoutes);
  app.use('/api/dcr', authenticateToken, authorizeModule('dcr'), dcrRoutes);
  app.use('/api/government-compliance', authenticateToken, authorizeModule('government-compliance'), governmentComplianceRoutes);
  app.use('/api/cic', authenticateToken, authorizeModule('government-compliance'), cicRoutes);
  app.use('/api/monitoring', authenticateToken, authorizeModule('monitoring'), monitoringRoutes);
  app.use('/api/ptp', authenticateToken, authorizeModule('ptp-monitoring'), promiseToPayRoutes);
  // Monitoring settings are managed inside 3-Day Monitoring, not as a separate module.
  app.use('/api/settings', authenticateToken, authorizeModule('monitoring'), settingsRoutes);
  app.use('/api/collector-performance', authenticateToken, authorizeModule('collector-performance'), collectorPerformanceRoutes);
  app.use('/api/forty-five-day-rating', authenticateToken, authorizeModule('collector-performance'), fortyFiveDayRatingRoutes);
  app.use('/api/demand-letters', authenticateToken, authorizeModule('demand-letter'), demandLetterRoutes);
  app.use('/api/system', systemRoutes);
  app.use('/api/jcash-migration', authenticateToken, authorizeModule('jcash-migration'), jcashMigrationRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', system: 'Melann Lending System V2', timestamp: new Date().toISOString() });
  });

  // Serve the compiled web client from the API process for LAN deployments.
  if (fs.existsSync(path.join(clientDistRoot, 'index.html'))) {
    app.use(express.static(clientDistRoot, {
      dotfiles: 'deny',
      index: false,
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    }));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.sendFile(path.join(clientDistRoot, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
