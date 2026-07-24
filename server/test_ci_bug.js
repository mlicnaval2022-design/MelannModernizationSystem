const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
  // Insert fake loan 1713
  db.run(`INSERT OR IGNORE INTO tblCustomer (id, customer_code, first_name, last_name, status) VALUES (999, 'TESTCUST', 'Test', 'Cust', 'active')`);
  db.run(`INSERT OR IGNORE INTO tblLoan (id, customer_id, loan_code, status, date_released, principal) VALUES (1713, 999, 'L-1713', 'pending', '2026-07-14', 1000)`);
});

setTimeout(() => {
  const http = require('http');
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ id: 1, role: 'admin', username: 'admin' }, 'your_jwt_secret', { expiresIn: '1h' });

  const postData = JSON.stringify({
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

  req.write(postData);
  req.end();

}, 1000);
