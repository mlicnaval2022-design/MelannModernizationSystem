require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const loanRoutes = require('./routes/loans');
const paymentRoutes = require('./routes/payments');
const collectorRoutes = require('./routes/collectors');
const branchRoutes = require('./routes/branches');
const depositRoutes = require('./routes/deposits');
const expenseRoutes = require('./routes/expenses');
const reportRoutes = require('./routes/reports');
const cashRoutes = require('./routes/cash');
const reversalRoutes = require('./routes/reversals');
const auditRoutes = require('./routes/audit');

const { initializeDatabase } = require('./db/database');
const { startPastDueScheduler } = require('./services/pastDueUpdater');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/collectors', collectorRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/reversals', reversalRoutes);
app.use('/api/audit', auditRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', system: 'Melann Lending System V2', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

initializeDatabase().then(() => {
  // Start background past-due status updater
  startPastDueScheduler();

  app.listen(PORT, () => {
    console.log(`\n🏦 Melann Lending System V2 Server`);
    console.log(`✅ Running on http://localhost:${PORT}`);
    console.log(`📦 Database: ${process.env.DB_PATH || './melann.db'}\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = app;
