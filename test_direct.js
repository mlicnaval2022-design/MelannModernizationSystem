// No express require

// Wait, let's just use child_process to spawn node server/src/index.js with PORT=5002
const { spawn } = require('child_process');
const http = require('http');

const env = { ...process.env, PORT: 5002 };
const serverProcess = spawn('node', ['server/src/index.js'], { env, stdio: 'pipe' });

serverProcess.stdout.on('data', data => console.log('SERVER STDOUT:', data.toString()));
serverProcess.stderr.on('data', data => console.error('SERVER STDERR:', data.toString()));

setTimeout(() => {
  const data = JSON.stringify({
    username: 'admin',
    password: 'admin123'
  });

  const req = http.request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      const token = JSON.parse(body).token;
      
      const reloanData = JSON.stringify({
        principal: 1000,
        loan_period: 45,
        interest_rate: 0,
        loan_type: "RELOAN"
      });

      const reloanReq = http.request({
        hostname: 'localhost',
        port: 5002,
        path: '/api/customers/1143/reloan',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': reloanData.length,
          'Authorization': `Bearer ${token}`
        }
      }, (reloanRes) => {
        let reloanBody = '';
        reloanRes.on('data', chunk => reloanBody += chunk);
        reloanRes.on('end', () => {
          console.log("Status:", reloanRes.statusCode);
          console.log("Body:", reloanBody);
          serverProcess.kill();
        });
      });
      
      reloanReq.write(reloanData);
      reloanReq.end();
    });
  });

  req.write(data);
  req.end();
}, 2000); // give server 2 seconds to start
