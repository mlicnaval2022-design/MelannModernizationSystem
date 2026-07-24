const http = require('http');

const data = JSON.stringify({
  username: 'admin',
  password: 'admin123'
});

const req = http.request({
  hostname: 'localhost',
  port: 5001,
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
    
    // Now request reloan
    const reloanData = JSON.stringify({
      principal: 1000,
      loan_period: 45,
      interest_rate: 0,
      loan_type: "RELOAN"
    });

    const reloanReq = http.request({
      hostname: 'localhost',
      port: 5001,
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
      });
    });
    
    reloanReq.on('error', e => console.error(e));
    reloanReq.write(reloanData);
    reloanReq.end();
  });
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
