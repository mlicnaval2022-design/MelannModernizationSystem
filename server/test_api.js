async function test() {
  try {
    const loginRes = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    
    const dashRes = await fetch('http://localhost:5001/api/reports/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const dashData = await dashRes.json();
    if (!dashRes.ok) {
      console.error("ERROR 500 DETAILS:", dashData);
    } else {
      console.log("SUCCESS:", Object.keys(dashData));
    }
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
test();
