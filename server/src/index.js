const path = require('path');
const http = require('node:http');
const https = require('node:https');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createApp } = require('./app');
const { closeDb, initializeDatabase } = require('./db/database');
const { startPastDueScheduler } = require('./services/pastDueUpdater');
const { startNoPaymentMonitoringScheduler } = require('./services/noPaymentMonitoring');
const { loadTlsOptions, validateProductionTransport } = require('./config/tls');

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');

validateProductionTransport();

initializeDatabase().then(() => {
  startPastDueScheduler();
  startNoPaymentMonitoringScheduler();

  const app = createApp();
  const tlsOptions = loadTlsOptions();
  const protocol = tlsOptions ? 'https' : 'http';
  const server = tlsOptions ? https.createServer(tlsOptions, app) : http.createServer(app);
  server.on('error', async (error) => {
    console.error(`Server startup/runtime error: ${error.message}`);
    await closeDb().catch(() => {});
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log('\nMelann Lending System V2 Server');
    console.log(`Running on ${protocol}://${HOST}:${PORT}`);
    console.log(`Database: ${process.env.DB_PATH || './melann.db'}\n`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received. Closing the server safely...`);
    const forceTimer = setTimeout(() => {
      console.error('Forced shutdown after graceful-close timeout.');
      process.exit(1);
    }, 10000);
    forceTimer.unref();
    server.close(async () => {
      try {
        await closeDb();
        process.exit(0);
      } catch (error) {
        console.error(`Database close failed: ${error.message}`);
        process.exit(1);
      }
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
