const http = require('http');

function testEndpoint(path) {
  return new Promise((resolve) => {
    // We need to bypass auth, so let's hit a public endpoint or fake the token? 
    // Wait, the routes are protected with `authenticateToken`.
    // I will write a quick script to generate a token for user 1.
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: 1, role: 'admin' }, 'your_jwt_secret', { expiresIn: '1h' });
    
    const options = {
      hostname: 'localhost',
      port: 5001,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    
    req.on('error', (e) => {
      resolve({ status: 500, body: e.message });
    });
    
    req.end();
  });
}

async function run() {
  const secret = process.env.JWT_SECRET || 'your_jwt_secret';
  console.log("Testing summary...");
  const s1 = await testEndpoint('/api/government-compliance/summary');
  console.log("Summary:", s1.status, s1.body.substring(0, 100));

  console.log("Testing CIC...");
  const s2 = await testEndpoint('/api/government-compliance/CIC');
  console.log("CIC:", s2.status, s2.body.substring(0, 100));

  console.log("Testing CIC history...");
  const s3 = await testEndpoint('/api/cic/history');
  console.log("History:", s3.status, s3.body.substring(0, 100));
}

run();
