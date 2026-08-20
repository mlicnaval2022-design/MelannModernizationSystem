const http = require('http');
const { initializeDatabase, dbGet, dbAll, dbRun, closeDb } = require('../../src/db/database');
const { createApp } = require('../../src/app');
const jwt = require('jsonwebtoken');

function makeRequest(server, options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function testPtpModule() {
  console.log('--- STARTING PTP MODULE VERIFICATION ---');
  await initializeDatabase();
  const app = createApp();

  const server = app.listen(0);
  await new Promise(resolve => server.on('listening', resolve));

  try {
    // Generate Admin Token
    const adminUser = await dbGet(`SELECT * FROM tblUser WHERE username = 'admin'`);
    const token = jwt.sign(
      { id: adminUser.id, username: adminUser.username, role: adminUser.role, branch_id: adminUser.branch_id },
      process.env.JWT_SECRET || 'melann_secret',
      { expiresIn: '1h' }
    );
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 1. Test search client
    console.log('1. Testing search client...');
    const anyCustomer = await dbGet(`SELECT * FROM tblCustomer LIMIT 1`);
    if (anyCustomer) {
      const searchRes = await makeRequest(server, {
        path: `/api/ptp/search-client?q=${encodeURIComponent(anyCustomer.customer_code || anyCustomer.first_name)}`,
        headers: authHeaders
      });

      console.log(`Search status: ${searchRes.status}, found ${searchRes.body.length} clients`);
      if (searchRes.status !== 200) throw new Error('Search client failed');

      // 2. Test create PTP
      console.log('2. Testing create PTP...');
      const createRes = await makeRequest(server, {
        path: '/api/ptp',
        method: 'POST',
        headers: authHeaders
      }, {
        customer_id: anyCustomer.id,
        promise_date: '2026-08-25',
        follow_up_date: '2026-08-24',
        recurring_schedule: 'Weekly',
        promised_amount: 0,
        payment_method: 'Field Collection',
        reason: 'Salary Delay',
        remarks: 'Test PTP commitment entry with 0 amount'
      });

      console.log(`Create PTP with 0 amount status: ${createRes.status}, body:`, createRes.body);
      if (createRes.status !== 201 || createRes.body.data.promised_amount !== 0) throw new Error('Create PTP with 0 amount failed: ' + JSON.stringify(createRes.body));
      const createdId = createRes.body.data.id;

      // 3. Test monitoring retrieval
      console.log('3. Testing monitoring retrieval...');
      const monRes = await makeRequest(server, {
        path: '/api/ptp/monitoring',
        headers: authHeaders
      });

      console.log(`Monitoring status: ${monRes.status}, total records: ${monRes.body.summary.total_records}, collector tabs: ${monRes.body.collectorTabs.length}`);
      if (monRes.status !== 200) throw new Error('Monitoring retrieval failed');

      // 4. Test due updates
      console.log('4. Testing due updates retrieval...');
      const dueRes = await makeRequest(server, {
        path: '/api/ptp/due-updates?due_filter=all_records',
        headers: authHeaders
      });

      console.log(`Due updates status: ${dueRes.status}, total count: ${dueRes.body.counts.total}`);
      if (dueRes.status !== 200) throw new Error('Due updates failed');

      // 4.1 Test notifications endpoint for badge
      console.log('4.1 Testing notifications endpoint...');
      const notifRes = await makeRequest(server, {
        path: '/api/ptp/notifications',
        headers: authHeaders
      });
      console.log(`Notifications status: ${notifRes.status}, count: ${notifRes.body.count}`);
      if (notifRes.status !== 200 || typeof notifRes.body.count !== 'number') throw new Error('Notifications failed');

      // 5. Test update status
      console.log('5. Testing update PTP status...');
      const updateRes = await makeRequest(server, {
        path: `/api/ptp/${createdId}/status`,
        method: 'PUT',
        headers: authHeaders
      }, {
        status: 'Paid',
        paid_amount: 1500,
        remarks: 'Payment collected successfully'
      });

      console.log(`Update status response: ${updateRes.status}, msg: ${updateRes.body.message}`);
      if (updateRes.status !== 200) throw new Error('Update PTP failed');

      // 6. Test delete test record
      console.log('6. Cleaning up test record...');
      const delRes = await makeRequest(server, {
        path: `/api/ptp/${createdId}`,
        method: 'DELETE',
        headers: authHeaders
      });
      console.log(`Delete status: ${delRes.status}`);
    }

    console.log('✅ ALL PTP MODULE BACKEND TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
    await closeDb();
  }
}

testPtpModule().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
