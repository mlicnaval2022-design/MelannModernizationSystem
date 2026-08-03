const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './.env' });

async function run() {
  try {
    const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
    const res = await fetch('http://localhost:5000/api/cic/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        year: 2026,
        month: 7,
        file_reference_number: 'TEST001'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    console.log('Preview success!');
    console.log('ID row length:', data.previewRecords.find(r => r.recordType === 'ID')?.values.length);
    console.log('CI row length:', data.previewRecords.find(r => r.recordType === 'CI')?.values.length);
  } catch (err) {
    console.error(err.message);
  }
}
run();
