const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createApp } = require('./app');
const { initializeDatabase } = require('./db/database');
const { startPastDueScheduler } = require('./services/pastDueUpdater');
const { startNoPaymentMonitoringScheduler } = require('./services/noPaymentMonitoring');

const PORT = process.env.PORT || 5001;

initializeDatabase().then(() => {
  startPastDueScheduler();
  startNoPaymentMonitoringScheduler();

  const app = createApp();
  app.listen(PORT, () => {
    console.log('\nMelann Lending System V2 Server');
    console.log(`Running on http://localhost:${PORT}`);
    console.log(`Database: ${process.env.DB_PATH || './melann.db'}\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
