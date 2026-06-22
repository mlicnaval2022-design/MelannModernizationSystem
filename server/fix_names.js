const { dbAll, dbRun } = require('./src/db/database');

async function fixNames() {
  const customers = await dbAll("SELECT id, first_name, last_name, middle_name, full_name FROM tblCustomer WHERE full_name IS NULL OR full_name = ''");
  console.log(`Found ${customers.length} customers with empty full_name`);
  for (const c of customers) {
    const fn = `${c.last_name}, ${c.first_name} ${c.middle_name || ''}`.trim();
    await dbRun("UPDATE tblCustomer SET full_name = ? WHERE id = ?", [fn, c.id]);
    console.log(`Updated ID ${c.id} -> ${fn}`);
  }
  console.log('Done');
}

fixNames().catch(console.error);
