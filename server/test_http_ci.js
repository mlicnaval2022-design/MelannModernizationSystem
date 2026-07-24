const http = require('http');

const jwt = require('jsonwebtoken');
// Try to get JWT secret from .env or default
require('dotenv').config({ path: 'd:/ModernizationMelannSystem/server/.env' });
const secret = process.env.JWT_SECRET || 'your_jwt_secret';
const token = jwt.sign({ id: 1, role: 'admin', username: 'admin' }, secret, { expiresIn: '1h' });

const postData = JSON.stringify({
  daily_sales: 0,
  daily_expenses: 0,
  other_income: 0,
  other_loans: 0,
  endorsement: 'for_approval'
});

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/loans/1713/ci',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`BODY: ${data}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
