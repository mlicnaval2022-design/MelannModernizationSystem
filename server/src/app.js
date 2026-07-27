const express = require('express');
const cors = require('cors');
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
const settingsRoutes = require('./routes/settings');
const collectorPerformanceRoutes = require('./routes/collectorPerformance');
const demandLetterRoutes = require('./routes/demandLetters');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  const allowedOrigins = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/192\.168\.\d+\.\d+:\d+$/];

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.some((allowed) => allowed.test(origin))) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/loans', loanRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/collectors', collectorRoutes);
  app.use('/api/branches', branchRoutes);
  app.use('/api/deposits', depositRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/cash', cashRoutes);
  app.use('/api/reversals', reversalRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/dcr', dcrRoutes);
  app.use('/api/government-compliance', governmentComplianceRoutes);
  app.use('/api/cic', cicRoutes);
  app.use('/api/monitoring', monitoringRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/collector-performance', collectorPerformanceRoutes);
  app.use('/api/demand-letters', demandLetterRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', system: 'Melann Lending System V2', timestamp: new Date().toISOString() });
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
