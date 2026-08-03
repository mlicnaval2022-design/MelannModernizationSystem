const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '../server/.env' });

async function run() {
  try {
    const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
    const res = await axios.post('http://localhost:5000/api/cic/preview', {
      year: 2026,
      month: 7,
      file_reference_number: 'TEST001'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Preview success!');
    console.log('ID row length:', res.data.previewRecords.find(r => r.recordType === 'ID')?.values.length);
    console.log('CI row length:', res.data.previewRecords.find(r => r.recordType === 'CI')?.values.length);
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}
run();
