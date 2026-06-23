const app = require('./src/index');
const http = require('http');

const server = http.createServer(app);
server.listen(0, async () => {
  const port = server.address().port;
  console.log('Server started on port ' + port);
  
  try {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET || 'melann_lending_secret_key_2026', { expiresIn: '1h' });
    
    console.log("Fetching dashboard data...");
    const res = await fetch(`http://localhost:${port}/api/reports/dashboard`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Status Code:', res.status);
    const text = await res.text();
    console.log('Response Body:', text.substring(0, 500) + (text.length > 500 ? '...' : ''));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
