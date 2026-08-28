const https = require('https');

const port = Number(process.env.PORT || 5001);
const request = https.get({
  hostname: '127.0.0.1',
  port,
  path: '/api/health',
  rejectUnauthorized: false,
  timeout: 3000,
}, (response) => {
  response.resume();
  process.exitCode = response.statusCode === 200 ? 0 : 1;
});

request.on('timeout', () => request.destroy(new Error('Health check timed out')));
request.on('error', () => {
  process.exitCode = 1;
});
