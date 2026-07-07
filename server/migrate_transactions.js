const { dbRun, dbAll, dbGet } = require('./src/db/database');

async function migrate() {
  console.log("Migrating tblExpense to tblTransaction...");
  try {
    const expenses = await dbAll("SELECT * FROM tblExpense");
    for (const exp of expenses) {
      // Check if it's already in tblTransaction to avoid duplicates if run multiple times
      const existing = await dbGet("SELECT id FROM tblTransaction WHERE id = ?", [exp.id]);
      if (!existing) {
        let type = 'Expense';
        if (exp.category === 'Short Overages') type = 'Short Overage';
        await dbRun(`INSERT INTO tblTransaction (id, branch_id, transaction_date, amount, transaction_type, category, description, payee, status, created_by, dcr_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [exp.id, exp.branch_id, exp.expense_date, exp.amount, type, exp.category, exp.description, exp.payee, exp.status, exp.created_by, exp.dcr_id, exp.created_at]);
      }
    }
    console.log(`Migrated ${expenses.length} records.`);
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

migrate();
