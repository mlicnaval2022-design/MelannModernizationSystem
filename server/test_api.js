const jwt = require('jsonwebtoken');

async function test() {
  try {
    const token = jwt.sign({id: 1, role: 'admin'}, process.env.JWT_SECRET || 'melann_secret_key_2024');
    const res = await fetch('http://127.0.0.1:5001/api/dcr/summary?date=2026-07-14&branch_id=', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || JSON.stringify(data));
    console.log('Success:', data.releases.length);
  } catch(e) {
    console.log('Error data:', e.message);
  }
}
test();
